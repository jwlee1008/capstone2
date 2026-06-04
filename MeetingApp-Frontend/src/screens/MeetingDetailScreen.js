import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { Directory, File as ExpoFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useFocusEffect } from '@react-navigation/native';
import { useAppContext } from '../context/AppContext';
import { CARD_SHADOW, COLORS } from '../theme';

const TABS = [
  { key: 'summary', label: '정리', icon: 'reader-outline' },
  { key: 'transcript', label: '대화록', icon: 'chatbubbles-outline' },
  { key: 'tasks', label: '할일', icon: 'checkmark-done-outline' },
];

const formatDateTime = (iso) => {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '-';
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const isValidDateInput = (value) => {
  const text = String(value || '').trim();
  if (!text) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

const normalizeManualTask = (task) => ({
  ...task,
  title: task.title.trim(),
  assignee: task.assignee.trim(),
  dueDate: task.dueDate.trim(),
});

const formatRecordingDuration = (millis = 0) => {
  const totalSeconds = Math.max(0, Math.floor((Number(millis) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

function getInitial(value) {
  return String(value || '?').trim().charAt(0).toUpperCase();
}

function sanitizeFileName(value, fallback = 'meno-meeting-report.pdf') {
  const text = String(value || fallback).trim() || fallback;
  const withExtension = text.toLowerCase().endsWith('.pdf') ? text : `${text}.pdf`;
  return withExtension.replace(/[\\/:*?"<>|\s]+/g, '_');
}

function appendTimestampToPdfName(fileName) {
  const safeName = sanitizeFileName(fileName);
  const baseName = safeName.replace(/\.pdf$/i, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '_');
  return `${baseName}_${stamp}.pdf`;
}

function isPickerCancelError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('cancel') || message.includes('취소');
}

function isMeetingNotesTargetError(error) {
  const message = String(error?.message || error?.data?.message || error?.data?.error || '').toLowerCase();
  return message.includes('회의록')
    && (message.includes('notion') || message.includes('노션'))
    && (message.includes('데이터베이스') || message.includes('database') || message.includes('권한'));
}

function writePdfToCache({ arrayBuffer, fileName }, fallbackName) {
  const safeFileName = sanitizeFileName(fileName, `${fallbackName || 'meeting'}_report.pdf`);
  const file = new ExpoFile(Paths.cache, safeFileName);
  try {
    if (file.exists) file.delete();
  } catch {}
  file.create({ intermediates: true, overwrite: true });
  file.write(new Uint8Array(arrayBuffer));
  return { fileName: safeFileName, uri: file.uri };
}

async function downloadPdfOnWeb({ arrayBuffer, fileName }, fallbackName) {
  const safeFileName = sanitizeFileName(fileName, `${fallbackName || 'meeting'}_report.pdf`);
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeFileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { fileName: safeFileName, saved: true };
}

async function savePdfToDevice(pdf, fallbackName) {
  if (Platform.OS === 'web') return downloadPdfOnWeb(pdf, fallbackName);

  const safeFileName = appendTimestampToPdfName(pdf.fileName || `${fallbackName || 'meeting'}_report.pdf`);
  if (Platform.OS === 'android') {
    const directory = await Directory.pickDirectoryAsync();
    const file = directory.createFile(safeFileName, 'application/pdf');
    file.write(new Uint8Array(pdf.arrayBuffer));
    return { fileName: safeFileName, uri: file.uri, saved: true };
  }

  return { ...writePdfToCache({ ...pdf, fileName: safeFileName }, fallbackName), saved: true };
}

async function sharePdf(pdf, fallbackName) {
  if (Platform.OS === 'web') return downloadPdfOnWeb(pdf, fallbackName);
  const file = writePdfToCache(pdf, fallbackName);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/pdf',
      dialogTitle: '회의록 PDF 내보내기',
    });
    return { ...file, shared: true };
  }

  return { ...file, shared: false };
}

export default function MeetingDetailScreen({ navigation, route }) {
  const { meetingId } = route.params;
  const {
    workspace,
    getMeetingById,
    refreshMeetingData,
    uploadRecordingAndTranscribe,
    updateSpeakerName,
    runTranscriptAnalysis,
    addCalendarTask,
    inviteMember,
    notionConnected,
    refreshNotionStatus,
    configureNotionMeetingNotesTarget,
    createNotionMeetingNotesTarget,
    exportMeetingPdf,
    exportMeetingToNotion,
  } = useAppContext();
  const meeting = getMeetingById(meetingId);
  const [activeTab, setActiveTab] = useState('summary');
  const [selectedSpeaker, setSelectedSpeaker] = useState(null);
  const [manualTask, setManualTask] = useState({ title: '', assignee: '', dueDate: '' });
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSource, setUploadSource] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisPending, setAnalysisPending] = useState(false);
  const [exportAction, setExportAction] = useState(null);
  const [meetingNotesTargetVisible, setMeetingNotesTargetVisible] = useState(false);
  const [meetingNotesTargetInput, setMeetingNotesTargetInput] = useState('');
  const [pendingNotionExport, setPendingNotionExport] = useState(false);
  const [isSavingMeetingNotesTarget, setIsSavingMeetingNotesTarget] = useState(false);

  const latestSession = meeting?.sessions?.[0];
  const transcriptItems = latestSession?.transcript || [];
  const speakerKeys = useMemo(
    () => Array.from(new Set(transcriptItems.map((segment) => segment.speakerKey))),
    [transcriptItems],
  );
  const isDone = latestSession?.processStatus === 'done';
  const canExportMeeting = Boolean(isDone && latestSession?.summary && !isAnalyzing && !analysisPending);
  const needsSpeakerMapping = latestSession?.processStatus === 'needs_mapping';
  const statusLabel = !latestSession ? '녹음 전' : isDone ? '정리 완료' : needsSpeakerMapping ? '화자 매핑 필요' : '정리 중';
  const statusTone = !latestSession ? COLORS.subtext : isDone ? COLORS.success : COLORS.warning;
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder, 500);
  const isRecording = Boolean(recorderState?.isRecording);
  const recordingDuration = formatRecordingDuration(recorderState?.durationMillis);

  const refreshCurrentMeeting = useCallback(() => {
    refreshMeetingData(meetingId).catch(() => {});
  }, [meetingId]);

  useFocusEffect(refreshCurrentMeeting);

  useEffect(() => {
    const shouldPoll = isUploading || isAnalyzing || analysisPending || latestSession?.processStatus === 'processing';
    if (!shouldPoll) return undefined;
    const intervalId = setInterval(refreshCurrentMeeting, 5000);
    return () => clearInterval(intervalId);
  }, [analysisPending, isAnalyzing, isUploading, latestSession?.processStatus, refreshCurrentMeeting]);

  useEffect(() => {
    if (isDone) setAnalysisPending(false);
  }, [isDone]);

  if (!meeting) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>회의를 찾을 수 없습니다.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <Text style={styles.goBackText}>돌아가기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (result.canceled) return;

      setIsUploading(true);
      setUploadSource('file');
      await uploadRecordingAndTranscribe(meeting.id, result.assets?.[0]);
      Alert.alert('업로드 완료', '회의 기록 정리를 시작했습니다.');
    } catch (error) {
      Alert.alert('업로드 실패', error?.message || '녹음 파일을 업로드하지 못했습니다.');
    } finally {
      setIsUploading(false);
      setUploadSource(null);
    }
  };

  const handleStartRecording = async () => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission?.granted) {
        Alert.alert('녹음 권한 필요', '마이크 권한을 허용해야 직접 녹음할 수 있습니다.');
        return;
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch (error) {
      Alert.alert('녹음 시작 실패', error?.message || '녹음을 시작하지 못했습니다.');
    }
  };

  const handleStopRecordingAndUpload = async () => {
    try {
      setIsUploading(true);
      setUploadSource('record');
      await audioRecorder.stop();
      const stoppedState = audioRecorder.getStatus?.();
      const uri = audioRecorder.uri || stoppedState?.url || recorderState?.url;
      if (!uri) throw new Error('녹음 파일을 찾을 수 없습니다.');
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      await uploadRecordingAndTranscribe(meeting.id, {
        uri,
        name: `meno-recording-${Date.now()}.m4a`,
        mimeType: 'audio/mp4',
      });
      Alert.alert('업로드 완료', '녹음 정리를 시작했습니다.');
    } catch (error) {
      Alert.alert('녹음 업로드 실패', error?.message || '녹음 파일을 업로드하지 못했습니다.');
    } finally {
      setIsUploading(false);
      setUploadSource(null);
    }
  };

  const handleCancelRecording = async () => {
    try {
      await audioRecorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    } catch {}
  };

  const registerTask = async (task) => {
    try {
      await addCalendarTask({
        ...task,
        meetingId: task.meetingId || meeting.id,
        workspaceId: task.workspaceId || meeting.workspaceId || workspace?.id,
      });
      await refreshMeetingData(meeting.id).catch(() => null);
      Alert.alert('등록 완료', '인앱 캘린더에 할일이 추가되었습니다.');
    } catch (error) {
      Alert.alert('등록 실패', error?.message || '할일을 등록하지 못했습니다.');
    }
  };

  const handleManualTaskSubmit = async () => {
    const nextTask = normalizeManualTask(manualTask);
    if (!nextTask.title) return Alert.alert('입력 오류', '업무 내용을 입력해주세요.');
    if (!isValidDateInput(nextTask.dueDate)) return Alert.alert('입력 오류', '마감일은 YYYY-MM-DD 형식으로 입력해주세요.');
    await registerTask(nextTask);
    setManualTask({ title: '', assignee: '', dueDate: '' });
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return Alert.alert('입력 오류', '회원가입 ID로 사용한 이메일을 입력해주세요.');
    try {
      setIsInviting(true);
      await inviteMember(inviteEmail);
      Alert.alert('초대 완료', '가입된 이메일로 초대를 보냈습니다.');
      setInviteEmail('');
    } catch (error) {
      Alert.alert('초대 실패', error?.message || '초대를 보내지 못했습니다.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleRunAnalysis = async () => {
    if (!latestSession?.transcriptId) return Alert.alert('할일 추출 불가', '대화록이 생성된 뒤 다시 시도해주세요.');
    try {
      setIsAnalyzing(true);
      const result = await runTranscriptAnalysis(meeting.id, latestSession.id);
      if (result.analysisDeferred) {
        setAnalysisPending(true);
        Alert.alert('할일 추출 진행중', '서버에서 분석을 계속 진행하고 있습니다. 완료되면 화면에 반영됩니다.');
      } else if (result.analysisError) {
        Alert.alert('할일 추출 실패', result.analysisError);
      } else {
        Alert.alert('할일 추출 완료', '회의 요약과 할일을 다시 불러왔습니다.');
      }
    } catch (error) {
      Alert.alert('할일 추출 실패', error?.message || '할일 추출을 실행하지 못했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveSpeakerName = async (name) => {
    if (!selectedSpeaker || !latestSession?.transcriptId) return;
    const nextName = String(name || '').trim() || `화자${selectedSpeaker}`;
    try {
      setIsAnalyzing(true);
      const result = await updateSpeakerName(meeting.id, latestSession.id, selectedSpeaker, nextName);
      setSelectedSpeaker(null);
      if (result.analysisDeferred) {
        setAnalysisPending(true);
        Alert.alert('화자 저장 완료', '화자 이름을 저장했고, 할일 추출은 서버에서 계속 진행 중입니다.');
      } else if (result.analysisError) {
        Alert.alert('화자 저장 완료', `화자 이름은 저장했지만 할일 추출은 실패했습니다.\n${result.analysisError}`);
      } else {
        Alert.alert('화자 저장 완료', '화자 이름과 회의 정리를 갱신했습니다.');
      }
    } catch (error) {
      Alert.alert('화자 저장 실패', error?.message || '화자 이름을 저장하지 못했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const assertExportReady = () => {
    if (canExportMeeting) return true;
    Alert.alert(
      '내보내기 대기',
      '회의 요약과 할일 추출이 완료된 뒤 내보낼 수 있습니다. 화자 매핑 후 할일 추출을 완료해주세요.',
    );
    return false;
  };

  const performPdfExport = async (mode) => {
    try {
      setExportAction('pdf');
      const pdf = await exportMeetingPdf(meeting.id, { includeEvents: true });
      const result = mode === 'share'
        ? await sharePdf(pdf, meeting.name)
        : await savePdfToDevice(pdf, meeting.name);
      if (mode === 'share') {
        if (!result.shared) Alert.alert('PDF 준비 완료', `${result.fileName} 파일을 만들었습니다.`);
      } else {
        Alert.alert('PDF 저장 완료', `${result.fileName} 파일을 저장했습니다.`);
      }
    } catch (error) {
      if (isPickerCancelError(error)) return;
      Alert.alert('PDF 내보내기 실패', error?.message || '회의록 PDF를 만들지 못했습니다.');
    } finally {
      setExportAction(null);
    }
  };

  const handleExportPdf = () => {
    if (!assertExportReady()) return;
    if (Platform.OS === 'web') {
      performPdfExport('save');
      return;
    }

    Alert.alert('PDF 내보내기', '기기에 저장하거나 다른 앱으로 공유할 수 있습니다.', [
      { text: '취소', style: 'cancel' },
      { text: '공유', onPress: () => performPdfExport('share') },
      { text: '기기에 저장', onPress: () => performPdfExport('save') },
    ]);
  };

  const openMeetingNotesTargetModal = (continueAfterSave = false) => {
    setPendingNotionExport(Boolean(continueAfterSave));
    setMeetingNotesTargetInput('');
    setMeetingNotesTargetVisible(true);
  };

  const performNotionExport = async (retryWithFreshTarget = true) => {
    try {
      setExportAction('notion');
      const result = await exportMeetingToNotion(meeting.id, { includeEvents: true });
      Alert.alert('Notion 저장 완료', result?.updated ? '기존 회의록 페이지를 갱신했습니다.' : '회의록 페이지를 새로 만들었습니다.', [
        { text: '확인' },
        ...(result?.notionUrl ? [{ text: '열기', onPress: () => Linking.openURL(result.notionUrl).catch(() => {}) }] : []),
      ]);
    } catch (error) {
      if (retryWithFreshTarget && isMeetingNotesTargetError(error)) {
        try {
          await createNotionMeetingNotesTarget?.();
          return await performNotionExport(false);
        } catch (retryError) {
          Alert.alert('Notion 저장 실패', retryError?.message || error?.message || '회의록을 Notion에 저장하지 못했습니다.');
          return null;
        }
      }
      Alert.alert('Notion 저장 실패', error?.message || '회의록을 Notion에 저장하지 못했습니다.');
    } finally {
      setExportAction(null);
    }
  };

  const prepareNotionExport = async () => {
    const status = await refreshNotionStatus?.().catch(() => null);
    if (!status?.linked && !notionConnected) {
      Alert.alert('Notion 연결 필요', 'Notion 계정을 먼저 연결한 뒤 회의록을 저장할 수 있습니다. 캘린더 화면에서 Notion 연결을 완료해주세요.');
      return false;
    }
    if (!status?.meetingNotesConfigured) {
      await createNotionMeetingNotesTarget?.();
      await performNotionExport(false);
      return false;
    }

    Alert.alert(
      'Notion 저장 위치',
      `${status.meetingNotesName || '등록된 회의록 DB'}에 저장합니다. 위치가 다르면 회의록 DB를 변경해주세요.`,
      [
        { text: '취소', style: 'cancel' },
        { text: 'DB 변경', onPress: () => openMeetingNotesTargetModal(true) },
        { text: '저장', onPress: performNotionExport },
      ],
    );
    return false;
  };

  const handleExportNotion = async () => {
    if (!assertExportReady()) return;
    try {
      setExportAction('notion');
      await prepareNotionExport();
    } catch (error) {
      Alert.alert('Notion 저장 실패', error?.message || '회의록을 Notion에 저장하지 못했습니다.');
    } finally {
      setExportAction(null);
    }
  };

  const handleSaveMeetingNotesTarget = async () => {
    const value = meetingNotesTargetInput.trim();
    if (!value) {
      Alert.alert('입력 필요', '회의록을 저장할 Notion 데이터베이스 URL 또는 ID를 입력해주세요.');
      return;
    }

    try {
      setIsSavingMeetingNotesTarget(true);
      const isUrl = /^https?:\/\//i.test(value);
      await configureNotionMeetingNotesTarget(isUrl
        ? { databaseUrl: value, name: 'Meno 회의록' }
        : { databaseId: value, name: 'Meno 회의록' });
      setMeetingNotesTargetVisible(false);
      setMeetingNotesTargetInput('');
      const shouldContinue = pendingNotionExport;
      setPendingNotionExport(false);
      if (shouldContinue && canExportMeeting) {
        await performNotionExport();
      } else {
        Alert.alert('Notion DB 등록 완료', '회의록 저장 위치를 변경했습니다.');
      }
    } catch (error) {
      Alert.alert('Notion DB 등록 실패', error?.message || '회의록 데이터베이스를 등록하지 못했습니다.');
    } finally {
      setIsSavingMeetingNotesTarget(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitial(meeting.name)}</Text>
            </View>
            <View style={styles.heroCopy}>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: statusTone }]} />
                <Text style={[styles.statusText, { color: statusTone }]}>{statusLabel}</Text>
              </View>
              <Text style={styles.meetingTitle} numberOfLines={2}>{meeting.name}</Text>
              <Text style={styles.meetingMeta}>{formatDateTime(meeting.createdAt)}</Text>
            </View>
          </View>

          {meeting.description ? <Text style={styles.description}>{meeting.description}</Text> : null}

          <View style={styles.metricsRow}>
            <Metric value={meeting.participants.length} label="멤버" />
            <Metric value={meeting.sessions.length} label="녹음" />
            <Metric value={latestSession?.taskCount ?? latestSession?.tasks?.length ?? 0} label="할일" />
          </View>
        </View>

        <Panel>
          <SectionHeader title="녹음" subtitle={isRecording ? `진행 중 ${recordingDuration}` : '파일을 올리거나 앱에서 바로 녹음하세요'} />
          <View style={styles.actionGrid}>
            <ActionButton
              icon={isRecording ? 'stop-circle' : 'mic-outline'}
              title={uploadSource === 'record' ? '녹음 업로드 중' : isRecording ? '녹음 종료' : '직접 녹음'}
              subtitle={isRecording ? '종료 후 바로 정리' : '앱에서 새로 녹음'}
              tone={isRecording ? COLORS.error : COLORS.primary}
              loading={uploadSource === 'record'}
              disabled={isUploading}
              onPress={isRecording ? handleStopRecordingAndUpload : handleStartRecording}
            />
            <ActionButton
              icon="folder-open-outline"
              title={uploadSource === 'file' ? '파일 업로드 중' : '파일 업로드'}
              subtitle="m4a, mp3 파일 선택"
              tone={COLORS.secondary}
              loading={uploadSource === 'file'}
              disabled={isUploading || isRecording}
              onPress={handlePickFile}
            />
          </View>
          {isRecording && !isUploading ? (
            <TouchableOpacity style={styles.cancelRecordButton} onPress={handleCancelRecording} activeOpacity={0.82}>
              <Ionicons name="close" size={16} color={COLORS.error} />
              <Text style={styles.cancelRecordText}>녹음 취소</Text>
            </TouchableOpacity>
          ) : null}
        </Panel>

        <Panel>
          <SectionHeader title="워크스페이스 초대" subtitle="가입 이메일로 회의 접근 권한을 보냅니다" />
          <View style={styles.inviteRow}>
            <TextInput
              style={styles.inviteInput}
              placeholder="teammate@example.com"
              placeholderTextColor={COLORS.subtext}
              value={inviteEmail}
              onChangeText={setInviteEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TouchableOpacity style={[styles.sendButton, isInviting && styles.disabled]} onPress={handleInvite} disabled={isInviting} activeOpacity={0.82}>
              {isInviting ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="send" size={18} color="#FFFFFF" />}
            </TouchableOpacity>
          </View>
          {workspace?.invitedEmails?.map((email) => (
            <Text key={email} style={styles.invitedText}>초대 대기: {email}</Text>
          ))}
        </Panel>

        {latestSession ? (
          <>
            <View style={styles.tabBar}>
              {TABS.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <TouchableOpacity key={tab.key} style={[styles.tabItem, isActive && styles.tabItemActive]} onPress={() => setActiveTab(tab.key)} activeOpacity={0.82}>
                    <Ionicons name={tab.icon} size={16} color={isActive ? COLORS.primary : COLORS.subtext} />
                    <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {activeTab === 'summary' ? (
              <SummaryTab
                latestSession={latestSession}
                isDone={isDone}
                isAnalyzing={isAnalyzing || analysisPending}
                speakerKeys={speakerKeys}
                canExport={canExportMeeting}
                exportAction={exportAction}
                onExportPdf={handleExportPdf}
                onExportNotion={handleExportNotion}
              />
            ) : null}

            {activeTab === 'transcript' ? (
              <TranscriptTab
                latestSession={latestSession}
                speakerKeys={speakerKeys}
                onSpeakerPress={setSelectedSpeaker}
              />
            ) : null}

            {activeTab === 'tasks' ? (
              <TasksTab
                latestSession={latestSession}
                manualTask={manualTask}
                setManualTask={setManualTask}
                onRegisterTask={registerTask}
                onManualSubmit={handleManualTaskSubmit}
                onRunAnalysis={handleRunAnalysis}
                isAnalyzing={isAnalyzing || analysisPending}
              />
            ) : null}
          </>
        ) : (
          <EmptyState
            icon="cloud-upload-outline"
            title="녹음 파일을 올리면 정리가 시작됩니다"
            description="회의마다 녹음을 누적하고, 대화록과 할일을 한 화면에서 관리할 수 있습니다."
          />
        )}
      </ScrollView>

      <SpeakerModal
        visible={Boolean(selectedSpeaker)}
        speakerKey={selectedSpeaker}
        members={workspace?.members || []}
        onClose={() => setSelectedSpeaker(null)}
        onSave={handleSaveSpeakerName}
        saving={isAnalyzing}
      />
      <MeetingNotesTargetModal
        visible={meetingNotesTargetVisible}
        value={meetingNotesTargetInput}
        onChangeText={setMeetingNotesTargetInput}
        onClose={() => {
          if (isSavingMeetingNotesTarget) return;
          setMeetingNotesTargetVisible(false);
          setPendingNotionExport(false);
        }}
        onSave={handleSaveMeetingNotesTarget}
        saving={isSavingMeetingNotesTarget}
      />
    </SafeAreaView>
  );
}

function SummaryTab({ latestSession, isDone, isAnalyzing, speakerKeys, canExport, exportAction, onExportPdf, onExportNotion }) {
  const summaryItems = latestSession.summaryBullets || [];
  const taskCount = latestSession.taskCount ?? latestSession.tasks.length;
  const statusTitle = isDone ? '회의 정리가 완료되었습니다' : latestSession.processStatus === 'needs_mapping' ? '화자 매핑을 완료해주세요' : '회의 기록을 정리하고 있습니다';
  const statusSubtitle = isAnalyzing ? `화자 ${speakerKeys.length || 0}명 · 할일 추출 중` : `화자 ${speakerKeys.length || 0}명 · 할일 ${taskCount}개`;
  const exportSubtitle = canExport ? '요약·키워드·할일·일정을 포함합니다' : 'AI 분석 완료 후 사용할 수 있습니다';
  return (
    <View style={styles.tabContent}>
      <Panel>
        <View style={styles.processingHeader}>
          {isDone && !isAnalyzing ? <Ionicons name="checkmark-circle" size={22} color={COLORS.success} /> : <ActivityIndicator size="small" color={COLORS.warning} />}
          <View style={styles.processingTextWrap}>
            <Text style={styles.panelTitle}>{statusTitle}</Text>
            <Text style={styles.panelSubtitle}>{statusSubtitle}</Text>
          </View>
        </View>
      </Panel>

      <Panel>
        <SectionHeader title="내보내기" subtitle={exportSubtitle} />
        <View style={styles.exportGrid}>
          <ExportButton
            icon="download-outline"
            title="PDF"
            subtitle="파일로 저장"
            loading={exportAction === 'pdf'}
            disabled={!canExport || Boolean(exportAction)}
            onPress={onExportPdf}
          />
          <ExportButton
            icon="document-text-outline"
            title="Notion"
            subtitle="회의록 DB 저장"
            loading={exportAction === 'notion'}
            disabled={!canExport || Boolean(exportAction)}
            onPress={onExportNotion}
          />
        </View>
      </Panel>

      <Panel>
        <SectionHeader title="요약" subtitle={latestSession.fileName} />
        {latestSession.keywords?.length ? (
          <View style={styles.keywordRow}>
            {latestSession.keywords.slice(0, 5).map((keyword) => (
              <View key={keyword} style={styles.keywordChip}>
                <Text style={styles.keywordText}>{keyword}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {summaryItems.length === 0 ? (
          <Text style={styles.emptyInlineText}>화자 매핑 후 AI 분석이 완료되면 요약이 표시됩니다.</Text>
        ) : (
          summaryItems.map((item) => <SummaryBullet key={item} text={item} />)
        )}
      </Panel>
    </View>
  );
}

function TranscriptTab({ latestSession, speakerKeys, onSpeakerPress }) {
  return (
    <View style={styles.tabContent}>
      <Panel>
        <SectionHeader title="화자 매핑" subtitle="이름을 지정하면 대화록에 바로 적용됩니다" />
        {speakerKeys.length === 0 ? (
          <Text style={styles.emptyInlineText}>아직 감지된 화자가 없습니다.</Text>
        ) : speakerKeys.map((key) => (
          <TouchableOpacity key={key} style={styles.speakerRow} onPress={() => onSpeakerPress(key)} activeOpacity={0.78}>
            <SpeakerBadge text={`화자${key}`} />
            <Text style={styles.speakerName}>{latestSession.speakerMap[key] || '이름 매핑 필요'}</Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
          </TouchableOpacity>
        ))}
      </Panel>

      <Panel>
        <SectionHeader title="전체 대화록" subtitle={`${latestSession.transcript.length}개 발화`} />
        {latestSession.transcript.length === 0 ? (
          <Text style={styles.emptyInlineText}>대화록을 생성하는 중입니다.</Text>
        ) : latestSession.transcript.map((segment) => (
          <View key={segment.id} style={styles.segmentRow}>
            <SpeakerBadge text={latestSession.speakerMap[segment.speakerKey] || `화자${segment.speakerKey}`} />
            <View style={styles.segmentBody}>
              <Text style={styles.segmentTime}>{segment.time}</Text>
              <Text style={styles.segmentText}>{segment.displayText || segment.correctedText || segment.text}</Text>
            </View>
          </View>
        ))}
      </Panel>
    </View>
  );
}

function ExportButton({ icon, title, subtitle, loading, disabled, onPress }) {
  return (
    <TouchableOpacity style={[styles.exportButton, disabled && styles.disabled]} onPress={onPress} disabled={disabled} activeOpacity={0.84}>
      <View style={styles.exportIcon}>
        {loading ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name={icon} size={20} color={COLORS.primary} />}
      </View>
      <Text style={styles.exportTitle}>{loading ? '진행 중' : title}</Text>
      <Text style={styles.exportSubtitle}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

function TasksTab({ latestSession, manualTask, setManualTask, onRegisterTask, onManualSubmit, onRunAnalysis, isAnalyzing }) {
  const canRunAnalysis = Boolean(latestSession.transcriptId) && !isAnalyzing;
  return (
    <View style={styles.tabContent}>
      <Panel>
        <SectionHeader
          title="할일 추출"
          subtitle={latestSession.transcriptId ? '현재 화자 매핑 기준으로 요약과 할일을 다시 만듭니다' : '대화록 생성 후 사용할 수 있습니다'}
        />
        <TouchableOpacity style={[styles.analysisButton, !canRunAnalysis && styles.disabled]} onPress={onRunAnalysis} disabled={!canRunAnalysis} activeOpacity={0.84}>
          {isAnalyzing ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="sparkles-outline" size={16} color={COLORS.primary} />}
          <Text style={styles.analysisButtonText}>{isAnalyzing ? '추출 진행중' : latestSession.tasks.length ? '할일 다시 추출' : '할일 추출'}</Text>
        </TouchableOpacity>
      </Panel>

      <Panel>
        <SectionHeader title="제안된 할일" subtitle={`${latestSession.tasks.length}개`} />
        {latestSession.tasks.length === 0 ? (
          <Text style={styles.emptyInlineText}>분석된 할일이 없습니다.</Text>
        ) : latestSession.tasks.map((task) => (
          <TaskRow key={task.id} task={task} onRegister={() => onRegisterTask(task)} />
        ))}
      </Panel>

      <Panel>
        <SectionHeader title="AI 추출 일정" subtitle={`${latestSession.events?.length || 0}개`} />
        {latestSession.events?.length ? latestSession.events.map((event) => (
          <EventRow key={event.id} event={event} />
        )) : <Text style={styles.emptyInlineText}>분석된 일정이 없습니다.</Text>}
      </Panel>

      <Panel>
        <SectionHeader title="수동 할일 등록" subtitle="바로 캘린더에 추가됩니다" />
        <TextInput
          style={styles.formInput}
          placeholder="업무 내용"
          placeholderTextColor={COLORS.muted}
          value={manualTask.title}
          onChangeText={(title) => setManualTask((prev) => ({ ...prev, title }))}
        />
        <TextInput
          style={styles.formInput}
          placeholder="담당자"
          placeholderTextColor={COLORS.muted}
          value={manualTask.assignee}
          onChangeText={(assignee) => setManualTask((prev) => ({ ...prev, assignee }))}
        />
        <TextInput
          style={styles.formInput}
          placeholder="마감일 예: 2026-06-10"
          placeholderTextColor={COLORS.muted}
          value={manualTask.dueDate}
          onChangeText={(dueDate) => setManualTask((prev) => ({ ...prev, dueDate }))}
        />
        <TouchableOpacity style={styles.primaryButton} onPress={onManualSubmit} activeOpacity={0.85}>
          <Text style={styles.primaryButtonText}>등록</Text>
        </TouchableOpacity>
      </Panel>
    </View>
  );
}

function Metric({ value, label }) {
  return (
    <View style={styles.metricItem}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Panel({ children, style }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

function SectionHeader({ title, subtitle }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
    </View>
  );
}

function ActionButton({ icon, title, subtitle, tone, loading, disabled, onPress }) {
  return (
    <TouchableOpacity style={[styles.actionButton, disabled && styles.disabled]} onPress={onPress} disabled={disabled} activeOpacity={0.84}>
      <View style={[styles.actionIcon, { backgroundColor: `${tone}14` }]}>
        {loading ? <ActivityIndicator size="small" color={tone} /> : <Ionicons name={icon} size={21} color={tone} />}
      </View>
      <View style={styles.actionTextWrap}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>
    </TouchableOpacity>
  );
}

function SummaryBullet({ text }) {
  return (
    <View style={styles.summaryBullet}>
      <View style={styles.summaryDot} />
      <Text style={styles.summaryText}>{text}</Text>
    </View>
  );
}

function SpeakerBadge({ text }) {
  return (
    <View style={styles.speakerBadge}>
      <Text style={styles.speakerBadgeText}>{text}</Text>
    </View>
  );
}

function TaskRow({ task, onRegister }) {
  return (
    <View style={styles.taskRow}>
      <View style={styles.taskContent}>
        <Text style={styles.taskTitle}>{task.title}</Text>
        <Text style={styles.taskMeta}>담당자 {task.assignee || '미정'} · 마감 {task.dueDate || '미정'}</Text>
      </View>
      <TouchableOpacity style={styles.inlineButton} onPress={onRegister} activeOpacity={0.82}>
        <Ionicons name="calendar-outline" size={14} color={COLORS.primary} />
        <Text style={styles.inlineButtonText}>등록</Text>
      </TouchableOpacity>
    </View>
  );
}

function EventRow({ event }) {
  return (
    <View style={styles.eventRow}>
      <View style={styles.eventIcon}>
        <Ionicons name="calendar-clear-outline" size={16} color={COLORS.secondary} />
      </View>
      <View style={styles.taskContent}>
        <Text style={styles.taskTitle}>{event.title}</Text>
        <Text style={styles.taskMeta}>{event.startAt || '시간 미정'}</Text>
      </View>
    </View>
  );
}

function EmptyState({ icon, title, description }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon} size={34} color={COLORS.muted} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
    </View>
  );
}

function SpeakerModal({ visible, speakerKey, members, onClose, onSave, saving }) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (visible) setName('');
  }, [visible, speakerKey]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>화자{speakerKey} 이름 지정</Text>
          <TextInput
            style={styles.formInput}
            placeholder="직접 이름 입력"
            placeholderTextColor={COLORS.muted}
            value={name}
            onChangeText={setName}
            editable={!saving}
          />
          {members.map((member) => (
            <TouchableOpacity key={member.id} style={[styles.memberPick, saving && styles.disabled]} onPress={() => onSave(member.name)} disabled={saving} activeOpacity={0.78}>
              <Text style={styles.memberPickName}>{member.name}</Text>
              <Text style={styles.memberPickRole}>{member.role}</Text>
            </TouchableOpacity>
          ))}
          <View style={styles.modalActions}>
            <TouchableOpacity style={[styles.modalCancelBtn, saving && styles.disabled]} onPress={onClose} disabled={saving} activeOpacity={0.82}>
              <Text style={styles.modalCancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalSaveBtn, saving && styles.disabled]} onPress={() => onSave(name || `화자${speakerKey}`)} disabled={saving} activeOpacity={0.82}>
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.modalSaveText}>저장</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function MeetingNotesTargetModal({ visible, value, onChangeText, onClose, onSave, saving }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>회의록 DB 등록</Text>
          <Text style={styles.modalDescription}>Notion에서 원하는 위치에 만든 회의록 데이터베이스 URL 또는 ID를 입력해주세요.</Text>
          <TextInput
            style={styles.formInput}
            placeholder="https://www.notion.so/... 또는 database ID"
            placeholderTextColor={COLORS.muted}
            value={value}
            onChangeText={onChangeText}
            autoCapitalize="none"
            editable={!saving}
          />
          <View style={styles.modalActions}>
            <TouchableOpacity style={[styles.modalCancelBtn, saving && styles.disabled]} onPress={onClose} disabled={saving} activeOpacity={0.82}>
              <Text style={styles.modalCancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalSaveBtn, saving && styles.disabled]} onPress={onSave} disabled={saving} activeOpacity={0.82}>
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.modalSaveText}>등록</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: 16, paddingBottom: 40 },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { fontSize: 16, color: COLORS.subtext },
  goBackText: { color: COLORS.primary, marginTop: 12, fontSize: 15, fontWeight: '700' },
  heroCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  heroTop: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  avatar: { width: 56, height: 56, borderRadius: 8, backgroundColor: COLORS.chip, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 24, fontWeight: '800', color: COLORS.primary },
  heroCopy: { flex: 1, minWidth: 0 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '800' },
  meetingTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: COLORS.text, letterSpacing: 0 },
  meetingMeta: { fontSize: 13, color: COLORS.subtext, marginTop: 3 },
  description: { marginTop: 14, fontSize: 13, lineHeight: 19, color: COLORS.subtext },
  metricsRow: { flexDirection: 'row', backgroundColor: COLORS.surfaceAlt, borderRadius: 8, marginTop: 16, paddingVertical: 12 },
  metricItem: { flex: 1, alignItems: 'center' },
  metricValue: { fontSize: 19, fontWeight: '800', color: COLORS.text },
  metricLabel: { fontSize: 11, color: COLORS.subtext, marginTop: 2, fontWeight: '700' },
  panel: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionHeader: { marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, letterSpacing: 0 },
  sectionSubtitle: { fontSize: 12, color: COLORS.subtext, marginTop: 3 },
  actionGrid: { flexDirection: 'row', gap: 10 },
  actionButton: { flex: 1, minHeight: 86, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, padding: 12, backgroundColor: COLORS.surfaceAlt },
  actionIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  actionTextWrap: { minWidth: 0 },
  actionTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  actionSubtitle: { fontSize: 11, lineHeight: 16, color: COLORS.subtext, marginTop: 2 },
  disabled: { opacity: 0.62 },
  cancelRecordButton: { height: 40, borderRadius: 8, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 },
  cancelRecordText: { color: COLORS.error, fontWeight: '800', fontSize: 13 },
  inviteRow: { flexDirection: 'row', gap: 8 },
  inviteInput: { flex: 1, minHeight: 46, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 12, color: COLORS.text, fontSize: 14, fontWeight: '700' },
  sendButton: { width: 46, height: 46, borderRadius: 8, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  invitedText: { fontSize: 12, color: COLORS.subtext, marginTop: 9 },
  tabBar: { flexDirection: 'row', backgroundColor: '#EEF0F3', borderRadius: 8, padding: 4, marginBottom: 12 },
  tabItem: { flex: 1, minHeight: 40, borderRadius: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  tabItemActive: { backgroundColor: COLORS.surface, ...CARD_SHADOW },
  tabText: { fontSize: 13, fontWeight: '800', color: COLORS.subtext },
  tabTextActive: { color: COLORS.primary },
  tabContent: { marginBottom: 12 },
  processingHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  processingTextWrap: { flex: 1, minWidth: 0 },
  panelTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  panelSubtitle: { fontSize: 12, color: COLORS.subtext, marginTop: 3 },
  exportGrid: { flexDirection: 'row', gap: 10 },
  exportButton: { flex: 1, minHeight: 92, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceAlt, padding: 12 },
  exportIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: COLORS.chip, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  exportTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text, letterSpacing: 0 },
  exportSubtitle: { fontSize: 11, color: COLORS.subtext, marginTop: 2, lineHeight: 16 },
  keywordRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
  keywordChip: { backgroundColor: COLORS.chip, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5 },
  keywordText: { fontSize: 11, color: COLORS.primary, fontWeight: '800' },
  emptyInlineText: { color: COLORS.subtext, fontSize: 13, lineHeight: 20 },
  summaryBullet: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 7 },
  summaryDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.secondary, marginTop: 7 },
  summaryText: { flex: 1, fontSize: 14, lineHeight: 21, color: COLORS.text },
  speakerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: COLORS.border },
  speakerBadge: { flexShrink: 0, backgroundColor: COLORS.chip, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  speakerBadgeText: { fontSize: 11, color: COLORS.primary, fontWeight: '800' },
  speakerName: { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: '700' },
  segmentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  segmentBody: { flex: 1, minWidth: 0 },
  segmentTime: { fontSize: 11, color: COLORS.muted, marginBottom: 3, fontWeight: '700' },
  segmentText: { fontSize: 14, lineHeight: 21, color: COLORS.text },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  eventIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  taskContent: { flex: 1, minWidth: 0 },
  taskTitle: { fontSize: 14, lineHeight: 20, color: COLORS.text, fontWeight: '800' },
  taskMeta: { fontSize: 12, color: COLORS.subtext, marginTop: 3 },
  analysisButton: { height: 44, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.chip, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  analysisButtonText: { fontSize: 13, color: COLORS.primary, fontWeight: '800' },
  inlineButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.chip, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 6 },
  inlineButtonText: { fontSize: 12, color: COLORS.primary, fontWeight: '800' },
  formInput: { minHeight: 46, borderRadius: 8, backgroundColor: COLORS.inputBg, paddingHorizontal: 12, color: COLORS.text, fontSize: 14, marginBottom: 9 },
  primaryButton: { height: 46, borderRadius: 8, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  emptyState: { alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: COLORS.surface, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginTop: 12, textAlign: 'center' },
  emptyDescription: { fontSize: 12, color: COLORS.subtext, textAlign: 'center', lineHeight: 18, marginTop: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.42)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', backgroundColor: COLORS.surface, borderRadius: 8, padding: 18 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 14 },
  modalDescription: { fontSize: 13, lineHeight: 19, color: COLORS.subtext, marginTop: -6, marginBottom: 12 },
  memberPick: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  memberPickName: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  memberPickRole: { fontSize: 12, color: COLORS.subtext },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalCancelBtn: { flex: 1, height: 44, borderRadius: 8, backgroundColor: COLORS.inputBg, alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { fontSize: 14, fontWeight: '800', color: COLORS.subtext },
  modalSaveBtn: { flex: 1, height: 44, borderRadius: 8, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  modalSaveText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
});
