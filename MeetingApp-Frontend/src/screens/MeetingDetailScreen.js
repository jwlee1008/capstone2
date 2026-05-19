import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import { useAppContext } from '../context/AppContext';
import { COLORS } from '../theme';
import UserInviteSearch from '../components/UserInviteSearch';

const formatDateTime = (iso) => { const d = new Date(iso); return isNaN(d.getTime()) ? '-' : `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const normalizeComparable = (value) => String(value || '').trim().toLowerCase();
const isMissingDueDate = (dueDate) => !String(dueDate || '').trim();
const getSupportedWebAudioMimeType = () => {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((type) => MediaRecorder.isTypeSupported(type)) || '';
};
const isTaskAssignedToUser = (task, user, workspace) => {
  if (!task || !user) return false;
  const members = workspace?.members || [];
  const currentMember = members.find((member) => {
    const memberIds = [member.id, member.userId].filter(Boolean).map(String);
    const userIds = [user.id, user.userId].filter(Boolean).map(String);
    if (memberIds.some((id) => userIds.includes(id))) return true;
    const memberKeys = [member.email, member.name].map(normalizeComparable).filter(Boolean);
    const userKeys = [user.email, user.name].map(normalizeComparable).filter(Boolean);
    return memberKeys.some((key) => userKeys.includes(key));
  });
  const userIds = [user.id, user.userId, currentMember?.id, currentMember?.userId].filter(Boolean).map(String);
  if (task.assigneeId && userIds.includes(String(task.assigneeId))) return true;
  const userNames = [user.name, user.email, currentMember?.name, currentMember?.email].map(normalizeComparable).filter(Boolean);
  const assigneeNames = [task.assignee, task.assigneeName].map(normalizeComparable).filter(Boolean);
  return assigneeNames.some((name) => userNames.includes(name));
};

export default function MeetingDetailScreen({ navigation, route }) {
  const { meetingId } = route.params;
  const {
    user,
    workspace,
    getMeetingById,
    refreshMeetingData,
    uploadRecordingAndTranscribe,
    refreshRecordingPipeline,
    updateSpeakerName,
    addCalendarTask,
    updateCalendarTask,
    inviteMember,
    deleteRecording,
    setNotionMeetingNotesDatabase,
    exportMeetingPdf,
    exportMeetingToNotion,
  } = useAppContext();
  const meeting = getMeetingById(meetingId);
  const [selectedSpeaker, setSelectedSpeaker] = useState(null);
  const [manualTask, setManualTask] = useState({ title: '', assignee: '', dueDate: '' });
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [dueDateTarget, setDueDateTarget] = useState(null);
  const [dueDateInput, setDueDateInput] = useState('');
  const [isSavingDueDate, setIsSavingDueDate] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [meetingNotesDbInput, setMeetingNotesDbInput] = useState('');
  const [exportAction, setExportAction] = useState(null);
  const webRecorderRef = useRef(null);
  const webChunksRef = useRef([]);
  const webStreamRef = useRef(null);
  const latestSession = meeting?.sessions?.[0];
  const speakerKeys = useMemo(() => latestSession ? Array.from(new Set(latestSession.transcript.map((s) => s.speakerKey))) : [], [latestSession]);
  const allTaskItems = useMemo(() => {
    if (!latestSession) return [];
    return (latestSession.tasks || []).map((task) => ({
      id: `task-${task.id}`,
      type: 'task',
      task,
      title: task.title || '제목 없는 할일',
      meta: `담당자: ${task.assignee || '미정'} · 마감: ${task.dueDate || '마감일 미정'}`,
      status: task.status || '등록됨',
      isMissingDueDate: isMissingDueDate(task.dueDate),
    }));
  }, [latestSession]);
  const calendarItems = useMemo(() => allTaskItems.filter((item) => isTaskAssignedToUser(item.task, user, workspace)), [allTaskItems, user, workspace]);
  const recordingTitle = Platform.OS === 'web' ? '브라우저 마이크 녹음' : '휴대폰 마이크 녹음';
  const recordingDesc = Platform.OS === 'web' ? '녹음 후 기존 업로드 API로 전송합니다' : '파일 업로드와 별도로 바로 녹음합니다';

  useEffect(() => {
    refreshMeetingData(meetingId).catch(() => {});
  }, [meetingId]);

  useEffect(() => {
    const recordingId = latestSession?.recordingId;
    const phase = latestSession?.pipeline?.phase;
    if (!recordingId || latestSession?.pipelineUnsupported || phase === 'COMPLETE' || phase === 'FAILED') return undefined;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      await refreshRecordingPipeline(meetingId, recordingId).catch(() => {});
    };
    tick();
    const timer = setInterval(tick, 3500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [meetingId, latestSession?.recordingId, latestSession?.pipeline?.phase, latestSession?.pipelineUnsupported]);

  useEffect(() => () => {
    webStreamRef.current?.getTracks?.().forEach((track) => track.stop());
  }, []);

  if (!meeting) return <SafeAreaView style={styles.safeArea}><View style={styles.errorContainer}><Text style={styles.errorText}>회의를 찾을 수 없습니다.</Text><TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.goBackText}>돌아가기</Text></TouchableOpacity></View></SafeAreaView>;

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (result.canceled) return;

      setIsUploading(true);
      await uploadRecordingAndTranscribe(meeting.id, result.assets?.[0]);
      Alert.alert('업로드 완료', '회의 기록 정리를 시작했습니다.');
    } catch (error) {
      Alert.alert('업로드 실패', error?.message || '녹음 파일을 업로드하지 못했습니다.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleStartRecording = async () => {
    if (Platform.OS === 'web') {
      if (!navigator?.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        return Alert.alert('녹음 불가', '이 브라우저는 마이크 녹음을 지원하지 않습니다.');
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = getSupportedWebAudioMimeType();
        const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        webChunksRef.current = [];
        webStreamRef.current = stream;
        webRecorderRef.current = mediaRecorder;
        mediaRecorder.ondataavailable = (event) => {
          if (event.data?.size > 0) webChunksRef.current.push(event.data);
        };
        mediaRecorder.onstop = async () => {
          const chunks = webChunksRef.current;
          const recordedType = mediaRecorder.mimeType || mimeType || 'audio/webm';
          webStreamRef.current?.getTracks?.().forEach((track) => track.stop());
          webStreamRef.current = null;
          webRecorderRef.current = null;
          setIsRecording(false);
          if (chunks.length === 0) return Alert.alert('녹음 실패', '녹음된 오디오 데이터가 없습니다.');
          try {
            setIsUploading(true);
            const blob = new Blob(chunks, { type: recordedType });
            // Current backend multipart validation only allows .m4a/.mp3 filenames.
            const extension = 'm4a';
            const file = new File([blob], `web-recording-${Date.now()}.${extension}`, { type: recordedType });
            await uploadRecordingAndTranscribe(meeting.id, {
              file,
              name: file.name,
              mimeType: recordedType,
            });
            Alert.alert('업로드 완료', '브라우저 녹음을 업로드하고 회의 기록 정리를 시작했습니다.');
          } catch (error) {
            Alert.alert('업로드 실패', error?.message || '브라우저 녹음을 업로드하지 못했습니다.');
          } finally {
            setIsUploading(false);
            webChunksRef.current = [];
          }
        };
        mediaRecorder.start();
        setIsRecording(true);
      } catch (error) {
        webStreamRef.current?.getTracks?.().forEach((track) => track.stop());
        webStreamRef.current = null;
        webRecorderRef.current = null;
        setIsRecording(false);
        Alert.alert('녹음 실패', error?.message || '마이크 권한을 확인해주세요.');
      }
      return;
    }
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) return Alert.alert('권한 필요', '마이크 권한을 허용해야 녹음할 수 있습니다.');
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const created = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(created.recording);
      setIsRecording(true);
    } catch (error) {
      Alert.alert('녹음 실패', error?.message || '녹음을 시작하지 못했습니다.');
    }
  };

  const handleStopRecordingAndUpload = async () => {
    if (Platform.OS === 'web') {
      const recorder = webRecorderRef.current;
      if (!recorder) return;
      if (recorder.state !== 'inactive') recorder.stop();
      return;
    }
    if (!recording) return;
    try {
      setIsUploading(true);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      setIsRecording(false);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      if (!uri) throw new Error('녹음 파일 URI를 찾지 못했습니다.');
      await uploadRecordingAndTranscribe(meeting.id, {
        uri,
        name: `mobile-recording-${Date.now()}.m4a`,
        mimeType: 'audio/mp4',
      });
      Alert.alert('업로드 완료', '휴대폰 녹음을 업로드하고 회의 기록 정리를 시작했습니다.');
    } catch (error) {
      Alert.alert('업로드 실패', error?.message || '녹음을 업로드하지 못했습니다.');
    } finally {
      setIsUploading(false);
    }
  };
  const registerTask = async (task) => {
    try {
      await addCalendarTask({ ...task, meetingId: task.meetingId || meeting.id, workspaceId: task.workspaceId || meeting.workspaceId || workspace?.id });
      Alert.alert('등록 완료', '인앱 캘린더에 할일이 추가되었습니다.');
      return true;
    } catch (error) {
      Alert.alert('등록 실패', error?.message || '할일을 등록하지 못했습니다.');
      return false;
    }
  };
  const openDueDateModal = (task) => {
    setDueDateTarget(task);
    setDueDateInput(task?.dueDate || '');
  };
  const handleSaveDueDate = async () => {
    const nextDueDate = dueDateInput.trim();
    if (!dueDateTarget || isSavingDueDate) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate)) return Alert.alert('입력 오류', '마감일은 2026-05-20 형식으로 입력해주세요.');
    try {
      setIsSavingDueDate(true);
      await updateCalendarTask(dueDateTarget.id, { dueDate: nextDueDate });
      setDueDateTarget(null);
      setDueDateInput('');
      Alert.alert('저장 완료', '마감일이 캘린더 항목에 반영되었습니다.');
    } catch (error) {
      Alert.alert('저장 실패', error?.message || '마감일을 저장하지 못했습니다.');
    } finally {
      setIsSavingDueDate(false);
    }
  };

  const handleDeleteRecording = () => {
    if (!latestSession?.recordingId) return;
    const runDelete = async () => {
      try {
        await deleteRecording(meeting.id, latestSession.recordingId);
        Alert.alert('삭제 완료', '녹음 파일을 삭제했습니다.');
      } catch (error) {
        Alert.alert('삭제 실패', error?.message || '녹음 파일을 삭제하지 못했습니다.');
      }
    };
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`${latestSession.fileName || '녹음 파일'}을 삭제할까요?`)) runDelete();
      return;
    }
    Alert.alert('녹음 파일 삭제', `${latestSession.fileName || '녹음 파일'}을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: runDelete },
    ]);
  };

  const handleSaveSpeaker = async (speaker) => {
    try {
      const result = await updateSpeakerName(meeting.id, latestSession.id, selectedSpeaker, speaker);
      setSelectedSpeaker(null);
      Alert.alert(
        result?.localOnly ? '화면 반영 완료' : '저장 완료',
        result?.localOnly
          ? '서버 권한 제한으로 앱 화면에 먼저 반영했습니다. 회의 생성자 계정에서는 서버 저장까지 진행됩니다.'
          : '화자 매핑을 저장했습니다.',
      );
    } catch (error) {
      Alert.alert('저장 실패', error?.message || '화자 매핑을 저장하지 못했습니다.');
    }
  };

  const handleSaveMeetingNotesDatabase = async () => {
    try {
      setExportAction('notes-db');
      await setNotionMeetingNotesDatabase(meetingNotesDbInput);
      setMeetingNotesDbInput('');
      Alert.alert('등록 완료', '회의록용 Notion 데이터베이스를 저장했습니다.');
    } catch (error) {
      Alert.alert('등록 실패', error?.message || '회의록 DB를 저장하지 못했습니다.');
    } finally {
      setExportAction(null);
    }
  };

  const handleExportPdf = async () => {
    try {
      setExportAction('pdf');
      const result = await exportMeetingPdf(meeting.id, true);
      if (result.objectUrl) {
        window.open(result.objectUrl, '_blank', 'noopener,noreferrer');
      } else {
        Alert.alert('PDF 생성 완료', 'PDF 응답을 받았습니다. 모바일 저장/공유는 파일 시스템 연동이 필요합니다.');
      }
    } catch (error) {
      Alert.alert('PDF 내보내기 실패', error?.message || 'PDF를 생성하지 못했습니다.');
    } finally {
      setExportAction(null);
    }
  };

  const handleExportNotion = async () => {
    try {
      setExportAction('notion');
      const result = await exportMeetingToNotion(meeting.id, true);
      const url = result?.notionUrl || result?.url;
      if (url) await Linking.openURL(url).catch(() => {});
      Alert.alert('저장 완료', '회의록을 Notion 데이터베이스에 저장했습니다.');
    } catch (error) {
      Alert.alert('Notion 저장 실패', error?.message || '회의록을 Notion에 저장하지 못했습니다.');
    } finally {
      setExportAction(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.infoCard}><View style={styles.infoCardTop}><View style={styles.meetingAvatarWrap}><Text style={styles.meetingAvatarText}>{meeting.name.charAt(0)}</Text></View><View style={styles.infoCardText}><Text style={styles.meetingNameLarge}>{meeting.name}</Text><Text style={styles.meetingCreateDate}>{formatDateTime(meeting.createdAt)}</Text></View></View>{meeting.description ? <View style={styles.descriptionBox}><Text style={styles.descriptionText}>{meeting.description}</Text></View> : null}<View style={styles.statsRow}><InfoStat value={meeting.participants.length} label="참여자" /><View style={styles.statDivider} /><InfoStat value={meeting.sessions.length} label="녹음 파일" /><View style={styles.statDivider} /><InfoStat value={latestSession?.tasks?.length || 0} label="제안 할일" /></View></View>
        <View style={styles.inviteCard}><View style={styles.analysisCardHeader}><Ionicons name="person-add-outline" size={17} color={COLORS.primary} /><Text style={styles.analysisCardTitle}>워크스페이스 초대</Text></View><UserInviteSearch description="이름이나 이메일로 가입된 사용자를 검색한 뒤 선택해서 초대하세요." invitedEmails={workspace?.invitedEmails || []} onInvite={inviteMember} /></View>
        <View style={styles.controlArea}>
          <TouchableOpacity style={styles.uploadBtn} onPress={handlePickFile} activeOpacity={0.85} disabled={isUploading || isRecording}><View style={styles.uploadBtnLeft}><View style={styles.uploadIconWrap}>{isUploading ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="folder-open-outline" size={22} color={COLORS.primary} />}</View><View style={{ flex: 1 }}><Text style={styles.uploadBtnTitle}>{isUploading ? '업로드 및 STT 진행중' : '녹음 파일 업로드'}</Text><Text style={styles.uploadBtnDesc}>서버에 녹음 파일을 저장하고 STT를 시작합니다</Text></View></View><Ionicons name="chevron-forward" size={18} color={COLORS.border} /></TouchableOpacity>
          <TouchableOpacity style={[styles.uploadBtn, styles.recordButton, isUploading && !isRecording && styles.uploadBtnDisabled]} onPress={isRecording ? handleStopRecordingAndUpload : handleStartRecording} activeOpacity={0.85} disabled={isUploading && !isRecording}>
            <View style={styles.uploadBtnLeft}><View style={[styles.uploadIconWrap, isRecording && styles.recordingIconWrap]}>{isRecording ? <Ionicons name="stop" size={22} color="#FFFFFF" /> : <Ionicons name="mic-outline" size={22} color={COLORS.error} />}</View><View style={{ flex: 1 }}><Text style={styles.uploadBtnTitle}>{isRecording ? '녹음 종료 및 업로드' : recordingTitle}</Text><Text style={styles.uploadBtnDesc}>{recordingDesc}</Text></View></View>
          </TouchableOpacity>
        </View>
        {latestSession ? <View style={styles.analysisSection}>
          <SectionTitle title="처리 상태" /><Card><PipelineStatus session={latestSession} onDelete={handleDeleteRecording} /></Card>
          <SectionTitle title="회의록 내보내기" /><Card><View style={styles.exportRow}><TextInput style={[styles.manualInput, styles.exportInput]} placeholder="회의록 Notion DB ID 또는 URL" value={meetingNotesDbInput} onChangeText={setMeetingNotesDbInput} autoCapitalize="none" /><TouchableOpacity style={[styles.exportIconBtn, (!meetingNotesDbInput.trim() || exportAction === 'notes-db') && styles.modalConfirmDisabled]} onPress={handleSaveMeetingNotesDatabase} disabled={!meetingNotesDbInput.trim() || exportAction === 'notes-db'}><Ionicons name="save-outline" size={17} color="#FFFFFF" /></TouchableOpacity></View><View style={styles.exportActions}><TouchableOpacity style={styles.exportActionBtn} onPress={handleExportPdf} disabled={Boolean(exportAction)}><Ionicons name="document-outline" size={16} color={COLORS.primary} /><Text style={styles.exportActionText}>{exportAction === 'pdf' ? 'PDF 생성 중' : 'PDF 내보내기'}</Text></TouchableOpacity><TouchableOpacity style={styles.exportActionBtn} onPress={handleExportNotion} disabled={Boolean(exportAction)}><Ionicons name="cloud-upload-outline" size={16} color={COLORS.text} /><Text style={[styles.exportActionText, { color: COLORS.text }]}>{exportAction === 'notion' ? '저장 중' : 'Notion 저장'}</Text></TouchableOpacity></View></Card>
          <SectionTitle title="화자 매핑" /><Card><View style={styles.analysisCardHeader}><Ionicons name="people-outline" size={16} color={COLORS.primary} /><Text style={styles.analysisCardTitle}>멤버 선택 또는 직접 입력</Text></View>{speakerKeys.map((key) => <TouchableOpacity key={key} style={styles.speakerRow} onPress={() => setSelectedSpeaker(key)}><SpeakerBadge text={`화자${key}`} /><Text style={styles.speakerName}>{latestSession.speakerMap[key] || '이름 매핑 필요'}</Text><Ionicons name="chevron-forward" size={16} color={COLORS.border} /></TouchableOpacity>)}</Card>
          <SectionTitle title="회의 정리" /><Card><View style={styles.analysisCardHeader}><View style={styles.summaryBadge}><Text style={styles.summaryBadgeText}>요약</Text></View><Text style={styles.cardDesc}>할일 {latestSession.taskCount ?? latestSession.tasks.length}개 · 일정 {latestSession.eventCount ?? (latestSession.events?.length || 0)}개</Text></View>{latestSession.keywords?.length ? <Text style={styles.keywordText}>키워드: {latestSession.keywords.join(', ')}</Text> : null}{latestSession.summaryBullets.length === 0 ? <Text style={styles.cardDesc}>화자 매핑 후 AI 분석을 실행하면 요약이 표시됩니다.</Text> : latestSession.summaryBullets.map((item) => <View key={item} style={styles.summaryItem}><View style={styles.taskDot} /><Text style={styles.summaryText}>{item}</Text></View>)}</Card>
          <Card><View style={styles.analysisCardHeader}><Ionicons name="chatbubbles-outline" size={16} color={COLORS.primary} /><Text style={styles.analysisCardTitle}>화자 이름이 적용된 전체 대화록</Text></View>{latestSession.transcript.map((seg) => <View key={seg.id} style={styles.segmentRow}><SpeakerBadge text={latestSession.speakerMap[seg.speakerKey] || `화자${seg.speakerKey}`} /><View style={{ flex: 1 }}><Text style={styles.segmentTime}>{seg.time}</Text><Text style={styles.segmentContent}>{seg.text}</Text></View></View>)}</Card>
          <Card><View style={styles.analysisCardHeader}><Ionicons name="calendar-clear-outline" size={16} color={COLORS.primary} /><Text style={styles.analysisCardTitle}>캘린더 항목</Text><TouchableOpacity style={styles.calendarViewAllBtn} onPress={() => setShowAllTasks(true)} activeOpacity={0.8}><Text style={styles.calendarViewAllText}>전체보기</Text></TouchableOpacity></View><Text style={styles.calendarOwnerHint}>내 할일 {calendarItems.length}개 · 전체 할일 {allTaskItems.length}개</Text>{calendarItems.length === 0 ? <View style={styles.calendarEmpty}><Ionicons name="calendar-outline" size={28} color={COLORS.border} /><Text style={styles.calendarEmptyText}>내 할일이 없어요.</Text></View> : <View style={styles.calendarList}>{calendarItems.map((item) => <CalendarItem key={item.id} item={item} onSchedulePress={openDueDateModal} />)}</View>}</Card>
          <Card><View style={styles.analysisCardHeader}><Ionicons name="create-outline" size={16} color={COLORS.primary} /><Text style={styles.analysisCardTitle}>수동 할일 등록</Text></View><TextInput style={styles.manualInput} placeholder="업무 내용" value={manualTask.title} onChangeText={(title) => setManualTask((p) => ({ ...p, title }))} /><TextInput style={styles.manualInput} placeholder="담당자" value={manualTask.assignee} onChangeText={(assignee) => setManualTask((p) => ({ ...p, assignee }))} /><TextInput style={styles.manualInput} placeholder="마감일 예: 2026-05-20" value={manualTask.dueDate} onChangeText={(dueDate) => setManualTask((p) => ({ ...p, dueDate }))} /><TouchableOpacity style={styles.manualAddBtn} onPress={async () => { if (!manualTask.title.trim()) return Alert.alert('입력 오류', '업무 내용을 입력해주세요.'); const saved = await registerTask(manualTask); if (saved) setManualTask({ title: '', assignee: '', dueDate: '' }); }}><Text style={styles.manualAddBtnText}>수동 등록</Text></TouchableOpacity></Card>
        </View> : <View style={styles.emptyAnalysisCard}><Ionicons name="cloud-upload-outline" size={40} color={COLORS.border} /><Text style={styles.emptyAnalysisTitle}>녹음 파일을 업로드해주세요</Text><Text style={styles.emptyAnalysisDesc}>회의마다 녹음 파일을 누적 업로드하고 캘린더 할일을 계속 갱신할 수 있습니다.</Text></View>}
      </ScrollView>
      <SpeakerModal visible={Boolean(selectedSpeaker)} speakerKey={selectedSpeaker} members={workspace?.members || []} onClose={() => setSelectedSpeaker(null)} onSave={handleSaveSpeaker} />
      <AllTasksModal visible={showAllTasks} items={allTaskItems} onClose={() => setShowAllTasks(false)} onSchedulePress={openDueDateModal} />
      <DueDateModal visible={Boolean(dueDateTarget)} task={dueDateTarget} value={dueDateInput} onChange={setDueDateInput} onClose={() => setDueDateTarget(null)} onSave={handleSaveDueDate} isSaving={isSavingDueDate} />
    </SafeAreaView>
  );
}

const PIPELINE_LABELS = {
  UPLOADED: '업로드 완료',
  TRANSCRIBING: '전사 진행 중',
  TRANSCRIPT_READY: '전사 완료',
  AWAITING_SPEAKER_MAPPING: '화자 매핑 필요',
  READY_FOR_ANALYSIS: '분석 준비 완료',
  ANALYZING: 'AI 분석 중',
  COMPLETE: '분석 완료',
  FAILED: '처리 실패',
};

function PipelineStatus({ session, onDelete }) {
  const phase = session.pipeline?.phase || (session.processStatus === 'done' ? 'COMPLETE' : 'UPLOADED');
  const isDone = phase === 'COMPLETE';
  const isFailed = phase === 'FAILED';
  const progress = session.pipeline?.progress;
  return (
    <>
      <View style={styles.analysisCardHeader}>
        {isDone ? <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.success} /> : isFailed ? <Ionicons name="alert-circle-outline" size={18} color={COLORS.error} /> : <ActivityIndicator size="small" color={COLORS.warning} />}
        <Text style={styles.analysisCardTitle}>{PIPELINE_LABELS[phase] || phase}</Text>
        {session.recordingId ? <TouchableOpacity style={styles.recordingDeleteBtn} onPress={onDelete} activeOpacity={0.8}><Ionicons name="trash-outline" size={15} color={COLORS.error} /></TouchableOpacity> : null}
      </View>
      <Text style={styles.cardDesc}>{session.fileName || '녹음 파일'} · {session.pipeline?.message || (isDone ? '대화 내용 확인 가능' : '서버 처리 상태를 확인 중입니다')}</Text>
      {session.pipelineUnsupported ? <Text style={styles.pipelineNotice}>세부 진행률 API가 없어 업로드 이후 상태는 결과 화면 갱신으로 확인합니다.</Text> : (
        <View style={styles.phaseGrid}>
          {Object.keys(PIPELINE_LABELS).map((key) => {
            const active = key === phase;
            const complete = Object.keys(PIPELINE_LABELS).indexOf(key) < Object.keys(PIPELINE_LABELS).indexOf(phase) && !isFailed;
            return <View key={key} style={[styles.phasePill, active && styles.phasePillActive, complete && styles.phasePillDone]}><Text style={[styles.phasePillText, (active || complete) && styles.phasePillTextActive]}>{PIPELINE_LABELS[key]}</Text></View>;
          })}
        </View>
      )}
      {progress != null ? <Text style={styles.pipelineProgress}>진행률 {progress}%</Text> : null}
      {isFailed && session.pipeline?.errorCode ? <Text style={styles.pipelineError}>오류 코드: {session.pipeline.errorCode}</Text> : null}
    </>
  );
}

function InfoStat({ value, label }) { return <View style={styles.statItem}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
function SectionTitle({ title }) { return <Text style={styles.sectionTitle}>{title}</Text>; }
function Card({ children }) { return <View style={styles.analysisCard}>{children}</View>; }
function SpeakerBadge({ text }) { return <View style={styles.segmentSpeakerBadge}><Text style={styles.segmentSpeaker}>{text}</Text></View>; }
function CalendarItem({ item, onSchedulePress }) {
  const isTask = item.type === 'task';
  return <View style={styles.calendarItem}><View style={[styles.calendarIcon, isTask ? styles.calendarIconTask : styles.calendarIconEvent]}><Ionicons name={isTask ? 'checkmark-circle-outline' : 'time-outline'} size={15} color={isTask ? COLORS.success : COLORS.primary} /></View><View style={styles.calendarItemBody}><View style={styles.calendarItemTop}><Text style={styles.calendarItemTitle} numberOfLines={2}>{item.title}</Text><View style={[styles.calendarTypeBadge, isTask ? styles.calendarTaskBadge : styles.calendarEventBadge]}><Text style={[styles.calendarTypeText, isTask ? styles.calendarTaskText : styles.calendarEventText]}>{isTask ? '할일' : '일정'}</Text></View></View><Text style={styles.calendarItemMeta}>{item.meta}</Text></View>{isTask && item.isMissingDueDate ? <TouchableOpacity style={styles.scheduleBtn} onPress={() => onSchedulePress?.(item.task)} activeOpacity={0.8}><Text style={styles.scheduleBtnText}>일정 입력</Text></TouchableOpacity> : isTask && item.status ? <View style={styles.taskStatusPill}><Text style={styles.taskStatusText}>{item.status}</Text></View> : null}</View>;
}
function AllTasksModal({ visible, items, onClose, onSchedulePress }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.allTasksModalCard}>
          <View style={styles.modalHeader}><View><Text style={styles.modalTitleTight}>전체 할일</Text><Text style={styles.modalSubtitle}>모든 담당자 할일 {items.length}개</Text></View><TouchableOpacity style={styles.modalCloseBtn} onPress={onClose}><Ionicons name="close" size={20} color={COLORS.subtext} /></TouchableOpacity></View>
          <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>{items.length === 0 ? <View style={styles.calendarEmpty}><Ionicons name="checkmark-circle-outline" size={28} color={COLORS.border} /><Text style={styles.calendarEmptyText}>등록된 할일이 없어요.</Text></View> : <View style={styles.calendarList}>{items.map((item) => <CalendarItem key={item.id} item={item} onSchedulePress={onSchedulePress} />)}</View>}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}
function DueDateModal({ visible, task, value, onChange, onClose, onSave, isSaving }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>마감일 입력</Text>
          <Text style={styles.modalSubtitle}>{task?.title || '할일'}</Text>
          <TextInput style={styles.manualInput} placeholder="예: 2026-05-20" value={value} onChangeText={onChange} />
          <Text style={styles.dateHint}>YYYY-MM-DD 형식으로 입력하면 캘린더 항목에 바로 반영됩니다.</Text>
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}><Text style={styles.modalCancelText}>취소</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.modalConfirmBtn, (!value.trim() || isSaving) && styles.modalConfirmDisabled]} onPress={onSave} disabled={!value.trim() || isSaving}><Text style={styles.modalConfirmText}>{isSaving ? '저장 중' : '저장'}</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
function SpeakerModal({ visible, speakerKey, members, onClose, onSave }) {
  const [name, setName] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName('');
    setSelectedMember(null);
    setIsSaving(false);
  }, [visible, speakerKey]);

  const handleNameChange = (value) => {
    setName(value);
    setSelectedMember(null);
  };

  const handleSelectMember = (member) => {
    setSelectedMember(member);
    setName(member.name || member.email || '');
  };

  const handleSubmit = async () => {
    const typedName = name.trim();
    const payload = selectedMember ? { ...selectedMember, name: typedName || selectedMember.name } : typedName;
    if (!payload || isSaving) return;
    try {
      setIsSaving(true);
      await onSave(payload);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>화자{speakerKey} 매핑</Text>
          <TextInput style={styles.manualInput} placeholder="직접 이름 입력" value={name} onChangeText={handleNameChange} />
          {members.map((m) => {
            const isSelected = String(selectedMember?.userId || selectedMember?.id || selectedMember?.email) === String(m.userId || m.id || m.email);
            return <TouchableOpacity key={m.id || m.email} style={[styles.memberPick, isSelected && styles.memberPickSelected]} onPress={() => handleSelectMember(m)}><Text style={styles.memberPickName}>{m.name}</Text><Text style={styles.memberPickRole}>{isSelected ? '선택됨' : m.role}</Text></TouchableOpacity>;
          })}
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}><Text style={styles.modalCancelText}>취소</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.modalConfirmBtn, (!selectedMember && !name.trim()) && styles.modalConfirmDisabled]} onPress={handleSubmit} disabled={isSaving || (!selectedMember && !name.trim())}><Text style={styles.modalConfirmText}>{isSaving ? '저장 중' : '저장'}</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: 16, paddingBottom: 40 },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 16, color: COLORS.subtext },
  goBackText: { color: COLORS.primary, marginTop: 12, fontSize: 15, fontWeight: '600' },
  infoCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 18, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  infoCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 16 },
  meetingAvatarWrap: { width: 54, height: 54, borderRadius: 15, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  meetingAvatarText: { fontSize: 23, fontWeight: '700', color: COLORS.primary },
  infoCardText: { flex: 1 },
  meetingNameLarge: { fontSize: 18, fontWeight: '700', color: COLORS.text, letterSpacing: 0 },
  meetingCreateDate: { fontSize: 12, color: COLORS.subtext, marginTop: 4 },
  descriptionBox: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: COLORS.primary },
  descriptionText: { fontSize: 13, color: COLORS.subtext, lineHeight: 19 },
  statsRow: { flexDirection: 'row', backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  statLabel: { fontSize: 11, color: COLORS.subtext, marginTop: 2 },
  statDivider: { width: 1, height: '80%', backgroundColor: COLORS.border, alignSelf: 'center' },
  inviteCard: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1.5, borderColor: COLORS.border },
  controlArea: { marginBottom: 24, gap: 10 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, borderWidth: 1.5, borderColor: COLORS.border, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  uploadBtnDisabled: { opacity: 0.45 },
  recordButton: { borderColor: '#FECACA' },
  uploadBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  uploadIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  recordingIconWrap: { backgroundColor: COLORS.error },
  uploadBtnTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  uploadBtnDesc: { fontSize: 12, color: COLORS.subtext, marginTop: 2 },
  analysisSection: { marginBottom: 24 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginBottom: 12, marginTop: 4 },
  analysisCard: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  analysisCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  analysisCardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, flex: 1 },
  recordingDeleteBtn: { width: 30, height: 30, borderRadius: 9, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  cardDesc: { fontSize: 13, color: COLORS.subtext, lineHeight: 19 },
  phaseGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  phasePill: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, backgroundColor: '#F1F5F9' },
  phasePillActive: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' },
  phasePillDone: { backgroundColor: '#ECFDF5' },
  phasePillText: { fontSize: 10, color: COLORS.subtext, fontWeight: '800' },
  phasePillTextActive: { color: COLORS.text },
  pipelineProgress: { fontSize: 11, color: COLORS.primary, fontWeight: '800', marginTop: 8 },
  pipelineNotice: { fontSize: 11, color: COLORS.subtext, lineHeight: 16, marginTop: 10, backgroundColor: '#F8FAFC', borderRadius: 8, padding: 10 },
  pipelineError: { fontSize: 11, color: COLORS.error, fontWeight: '700', marginTop: 6 },
  exportRow: { flexDirection: 'row', gap: 8 },
  exportInput: { flex: 1 },
  exportIconBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: COLORS.text, alignItems: 'center', justifyContent: 'center' },
  exportActions: { flexDirection: 'row', gap: 8 },
  exportActionBtn: { flex: 1, height: 42, borderRadius: 11, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  exportActionText: { fontSize: 12, color: COLORS.primary, fontWeight: '800' },
  keywordText: { fontSize: 12, color: COLORS.primary, fontWeight: '700', marginBottom: 10 },
  speakerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  speakerName: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.text },
  summaryBadge: { backgroundColor: COLORS.secondary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  summaryBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  summaryItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  summaryText: { fontSize: 13, color: COLORS.text, lineHeight: 20, flex: 1 },
  segmentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  segmentSpeakerBadge: { backgroundColor: '#EEF2FF', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, flexShrink: 0 },
  segmentSpeaker: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  segmentTime: { fontSize: 10, color: COLORS.subtext, marginBottom: 2 },
  segmentContent: { fontSize: 12, color: COLORS.text, lineHeight: 18, flex: 1 },
  taskDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success, marginTop: 5, flexShrink: 0 },
  taskStatusPill: { backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 },
  taskStatusText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  calendarViewAllBtn: { backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  calendarViewAllText: { fontSize: 11, fontWeight: '800', color: COLORS.primary },
  calendarOwnerHint: { fontSize: 12, color: COLORS.subtext, marginTop: -4, marginBottom: 10 },
  calendarEmpty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  calendarEmptyText: { fontSize: 12, fontWeight: '600', color: COLORS.subtext, marginTop: 6 },
  calendarList: { borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  calendarItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  calendarIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  calendarIconTask: { backgroundColor: '#ECFDF5' },
  calendarIconEvent: { backgroundColor: '#EEF2FF' },
  calendarItemBody: { flex: 1 },
  calendarItemTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  calendarItemTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.text, lineHeight: 19 },
  calendarItemMeta: { fontSize: 11, color: COLORS.subtext, marginTop: 3, lineHeight: 16 },
  calendarTypeBadge: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3, flexShrink: 0 },
  calendarTaskBadge: { backgroundColor: '#ECFDF5' },
  calendarEventBadge: { backgroundColor: '#EEF2FF' },
  calendarTypeText: { fontSize: 10, fontWeight: '800' },
  calendarTaskText: { color: COLORS.success },
  calendarEventText: { color: COLORS.primary },
  scheduleBtn: { backgroundColor: '#FFFBEB', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8, borderWidth: 1, borderColor: '#FDE68A' },
  scheduleBtnText: { fontSize: 11, fontWeight: '800', color: COLORS.warning },
  manualInput: { backgroundColor: '#F1F5F9', borderRadius: 12, height: 46, paddingHorizontal: 12, color: COLORS.text, marginBottom: 10 },
  manualAddBtn: { height: 46, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  manualAddBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  emptyAnalysisCard: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 28, alignItems: 'center', marginBottom: 24 },
  emptyAnalysisTitle: { fontSize: 15, fontWeight: '700', color: COLORS.subtext, marginTop: 12 },
  emptyAnalysisDesc: { fontSize: 12, color: '#A0AEC0', textAlign: 'center', marginTop: 5, lineHeight: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  modalCard: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 24, width: '100%' },
  allTasksModalCard: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 20, width: '100%', maxHeight: '78%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  modalCloseBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  modalScroll: { maxHeight: 420 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 14 },
  modalTitleTight: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  modalSubtitle: { fontSize: 12, color: COLORS.subtext, lineHeight: 18, marginBottom: 10 },
  dateHint: { fontSize: 11, color: COLORS.subtext, lineHeight: 16 },
  memberPick: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 8, borderRadius: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  memberPickSelected: { backgroundColor: '#EEF2FF' },
  memberPickName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  memberPickRole: { fontSize: 12, color: COLORS.subtext },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalCancelBtn: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: COLORS.subtext },
  modalConfirmBtn: { flex: 1, height: 46, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  modalConfirmDisabled: { opacity: 0.5 },
  modalConfirmText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
