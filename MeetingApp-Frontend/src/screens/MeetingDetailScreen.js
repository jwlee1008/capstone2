import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useAppContext } from '../context/AppContext';
import { COLORS } from '../theme';
import UserInviteSearch from '../components/UserInviteSearch';

const formatDateTime = (iso) => { const d = new Date(iso); return isNaN(d.getTime()) ? '-' : `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export default function MeetingDetailScreen({ navigation, route }) {
  const { meetingId } = route.params;
  const { workspace, getMeetingById, refreshMeetingData, uploadRecordingAndTranscribe, updateSpeakerName, addCalendarTask, inviteMember } = useAppContext();
  const meeting = getMeetingById(meetingId);
  const [selectedSpeaker, setSelectedSpeaker] = useState(null);
  const [manualTask, setManualTask] = useState({ title: '', assignee: '', dueDate: '' });
  const [isUploading, setIsUploading] = useState(false);
  const latestSession = meeting?.sessions?.[0];
  const speakerKeys = useMemo(() => latestSession ? Array.from(new Set(latestSession.transcript.map((s) => s.speakerKey))) : [], [latestSession]);

  useEffect(() => {
    refreshMeetingData(meetingId).catch(() => {});
  }, [meetingId]);

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
  const registerTask = async (task) => {
    try {
      await addCalendarTask({ ...task, meetingId: task.meetingId || meeting.id, workspaceId: task.workspaceId || meeting.workspaceId || workspace?.id });
      Alert.alert('등록 완료', '인앱 캘린더에 할일이 추가되었습니다.');
    } catch (error) {
      Alert.alert('등록 실패', error?.message || '할일을 등록하지 못했습니다.');
    }
  };
  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.infoCard}><View style={styles.infoCardTop}><View style={styles.meetingAvatarWrap}><Text style={styles.meetingAvatarText}>{meeting.name.charAt(0)}</Text></View><View style={styles.infoCardText}><Text style={styles.meetingNameLarge}>{meeting.name}</Text><Text style={styles.meetingCreateDate}>{formatDateTime(meeting.createdAt)}</Text></View></View>{meeting.description ? <View style={styles.descriptionBox}><Text style={styles.descriptionText}>{meeting.description}</Text></View> : null}<View style={styles.statsRow}><InfoStat value={meeting.participants.length} label="참여자" /><View style={styles.statDivider} /><InfoStat value={meeting.sessions.length} label="녹음 파일" /><View style={styles.statDivider} /><InfoStat value={latestSession?.tasks?.length || 0} label="제안 할일" /></View></View>
        <View style={styles.inviteCard}><View style={styles.analysisCardHeader}><Ionicons name="person-add-outline" size={17} color={COLORS.primary} /><Text style={styles.analysisCardTitle}>워크스페이스 초대</Text></View><UserInviteSearch description="이름이나 이메일로 가입된 사용자를 검색한 뒤 선택해서 초대하세요." invitedEmails={workspace?.invitedEmails || []} onInvite={inviteMember} /></View>
        <View style={styles.controlArea}><TouchableOpacity style={styles.uploadBtn} onPress={handlePickFile} activeOpacity={0.85} disabled={isUploading}><View style={styles.uploadBtnLeft}><View style={styles.uploadIconWrap}>{isUploading ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="folder-open-outline" size={22} color={COLORS.primary} />}</View><View style={{ flex: 1 }}><Text style={styles.uploadBtnTitle}>{isUploading ? '업로드 및 STT 진행중' : '녹음 파일 업로드'}</Text><Text style={styles.uploadBtnDesc}>서버에 녹음 파일을 저장하고 STT를 시작합니다</Text></View></View><Ionicons name="chevron-forward" size={18} color={COLORS.border} /></TouchableOpacity></View>
        {latestSession ? <View style={styles.analysisSection}>
          <SectionTitle title="처리 상태" /><Card><View style={styles.analysisCardHeader}>{latestSession.processStatus === 'done' ? <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.success} /> : <ActivityIndicator size="small" color={COLORS.warning} />}<Text style={styles.analysisCardTitle}>{latestSession.processStatus === 'done' ? '대화 내용 확인 가능' : '기록 정리중'}</Text></View><Text style={styles.cardDesc}>화자 구분: 화자A, 화자B, 화자C</Text></Card>
          <SectionTitle title="화자 매핑" /><Card><View style={styles.analysisCardHeader}><Ionicons name="people-outline" size={16} color={COLORS.primary} /><Text style={styles.analysisCardTitle}>멤버 선택 또는 직접 입력</Text><View style={styles.slackBadge}><Text style={styles.slackBadgeText}>채널 연동</Text></View></View>{speakerKeys.map((key) => <TouchableOpacity key={key} style={styles.speakerRow} onPress={() => setSelectedSpeaker(key)}><SpeakerBadge text={`화자${key}`} /><Text style={styles.speakerName}>{latestSession.speakerMap[key] || '이름 매핑 필요'}</Text><Ionicons name="chevron-forward" size={16} color={COLORS.border} /></TouchableOpacity>)}</Card>
          <SectionTitle title="회의 정리" /><Card><View style={styles.analysisCardHeader}><View style={styles.summaryBadge}><Text style={styles.summaryBadgeText}>요약</Text></View><Text style={styles.cardDesc}>할일 {latestSession.taskCount ?? latestSession.tasks.length}개 · 일정 {latestSession.eventCount ?? (latestSession.events?.length || 0)}개</Text></View>{latestSession.keywords?.length ? <Text style={styles.keywordText}>키워드: {latestSession.keywords.join(', ')}</Text> : null}{latestSession.summaryBullets.length === 0 ? <Text style={styles.cardDesc}>화자 매핑 후 AI 분석을 실행하면 요약이 표시됩니다.</Text> : latestSession.summaryBullets.map((item) => <View key={item} style={styles.summaryItem}><View style={styles.taskDot} /><Text style={styles.summaryText}>{item}</Text></View>)}</Card>
          <Card><View style={styles.analysisCardHeader}><Ionicons name="chatbubbles-outline" size={16} color={COLORS.primary} /><Text style={styles.analysisCardTitle}>화자 이름이 적용된 전체 대화록</Text></View>{latestSession.transcript.map((seg) => <View key={seg.id} style={styles.segmentRow}><SpeakerBadge text={latestSession.speakerMap[seg.speakerKey] || `화자${seg.speakerKey}`} /><View style={{ flex: 1 }}><Text style={styles.segmentTime}>{seg.time}</Text><Text style={styles.segmentContent}>{seg.text}</Text></View></View>)}</Card>
          <Card><View style={styles.analysisCardHeader}><Ionicons name="checkmark-circle-outline" size={16} color={COLORS.success} /><Text style={styles.analysisCardTitle}>생성된 할일</Text></View>{latestSession.tasks.map((task) => <View key={task.id} style={styles.taskItem}><View style={styles.taskDot} /><View style={{ flex: 1 }}><Text style={styles.taskTitle}>{task.title}</Text><Text style={styles.taskDue}>담당자: {task.assignee} · 마감: {task.dueDate}</Text></View><View style={styles.taskStatusPill}><Text style={styles.taskStatusText}>{task.status}</Text></View></View>)}</Card>
          <Card><View style={styles.analysisCardHeader}><Ionicons name="time-outline" size={16} color={COLORS.primary} /><Text style={styles.analysisCardTitle}>AI 추출 일정</Text></View>{latestSession.events?.length ? latestSession.events.map((event) => <View key={event.id} style={styles.taskItem}><View style={styles.taskDot} /><View style={{ flex: 1 }}><Text style={styles.taskTitle}>{event.title}</Text><Text style={styles.taskDue}>{event.startAt}</Text></View></View>) : <Text style={styles.cardDesc}>분석된 일정이 없어요.</Text>}</Card>
          <Card><View style={styles.analysisCardHeader}><Ionicons name="create-outline" size={16} color={COLORS.primary} /><Text style={styles.analysisCardTitle}>수동 할일 등록</Text></View><TextInput style={styles.manualInput} placeholder="업무 내용" value={manualTask.title} onChangeText={(title) => setManualTask((p) => ({ ...p, title }))} /><TextInput style={styles.manualInput} placeholder="담당자" value={manualTask.assignee} onChangeText={(assignee) => setManualTask((p) => ({ ...p, assignee }))} /><TextInput style={styles.manualInput} placeholder="마감일 예: 2026-05-20" value={manualTask.dueDate} onChangeText={(dueDate) => setManualTask((p) => ({ ...p, dueDate }))} /><TouchableOpacity style={styles.manualAddBtn} onPress={async () => { if (!manualTask.title.trim()) return Alert.alert('입력 오류', '업무 내용을 입력해주세요.'); await registerTask(manualTask); setManualTask({ title: '', assignee: '', dueDate: '' }); }}><Text style={styles.manualAddBtnText}>수동 등록</Text></TouchableOpacity></Card>
        </View> : <View style={styles.emptyAnalysisCard}><Ionicons name="cloud-upload-outline" size={40} color={COLORS.border} /><Text style={styles.emptyAnalysisTitle}>녹음 파일을 업로드해주세요</Text><Text style={styles.emptyAnalysisDesc}>회의마다 녹음 파일을 누적 업로드하고 캘린더 할일을 계속 갱신할 수 있습니다.</Text></View>}
      </ScrollView>
      <SpeakerModal visible={Boolean(selectedSpeaker)} speakerKey={selectedSpeaker} members={workspace?.members || []} onClose={() => setSelectedSpeaker(null)} onSave={async (speaker) => { await updateSpeakerName(meeting.id, latestSession.id, selectedSpeaker, speaker); setSelectedSpeaker(null); }} />
    </SafeAreaView>
  );
}
function InfoStat({ value, label }) { return <View style={styles.statItem}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
function SectionTitle({ title }) { return <Text style={styles.sectionTitle}>{title}</Text>; }
function Card({ children }) { return <View style={styles.analysisCard}>{children}</View>; }
function SpeakerBadge({ text }) { return <View style={styles.segmentSpeakerBadge}><Text style={styles.segmentSpeaker}>{text}</Text></View>; }
function SpeakerModal({ visible, speakerKey, members, onClose, onSave }) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (visible) setName('');
  }, [visible, speakerKey]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>화자{speakerKey} 매핑</Text>
          <TextInput style={styles.manualInput} placeholder="직접 이름 입력" value={name} onChangeText={setName} />
          {members.map((m) => <TouchableOpacity key={m.id} style={styles.memberPick} onPress={() => onSave(m)}><Text style={styles.memberPickName}>{m.name}</Text><Text style={styles.memberPickRole}>{m.role}</Text></TouchableOpacity>)}
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}><Text style={styles.modalCancelText}>취소</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalConfirmBtn} onPress={() => onSave(name || `화자${speakerKey}`)}><Text style={styles.modalConfirmText}>저장</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background }, scrollContent: { padding: 16, paddingBottom: 40 }, errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' }, errorText: { fontSize: 16, color: COLORS.subtext }, goBackText: { color: COLORS.primary, marginTop: 12, fontSize: 15, fontWeight: '600' }, infoCard: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }, infoCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 16 }, meetingAvatarWrap: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }, meetingAvatarText: { fontSize: 24, fontWeight: '700', color: COLORS.primary }, infoCardText: { flex: 1 }, meetingNameLarge: { fontSize: 18, fontWeight: '700', color: COLORS.text, letterSpacing: 0 }, meetingCreateDate: { fontSize: 12, color: COLORS.subtext, marginTop: 4 }, descriptionBox: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: COLORS.primary }, descriptionText: { fontSize: 13, color: COLORS.subtext, lineHeight: 19 }, statsRow: { flexDirection: 'row', backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14 }, statItem: { flex: 1, alignItems: 'center' }, statValue: { fontSize: 20, fontWeight: '700', color: COLORS.text }, statLabel: { fontSize: 11, color: COLORS.subtext, marginTop: 2 }, statDivider: { width: 1, height: '80%', backgroundColor: COLORS.border, alignSelf: 'center' }, inviteCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1.5, borderColor: COLORS.border }, inviteRow: { flexDirection: 'row', gap: 8, marginTop: 12 }, inviteInput: { flex: 1, marginBottom: 0 }, inviteBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }, inviteBtnDisabled: { opacity: 0.6 }, invitedText: { fontSize: 12, color: COLORS.subtext, marginTop: 8 }, controlArea: { marginBottom: 24 }, uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: COLORS.border, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }, uploadBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }, uploadIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }, uploadBtnTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text }, uploadBtnDesc: { fontSize: 12, color: COLORS.subtext, marginTop: 2 }, analysisSection: { marginBottom: 24 }, sectionTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginBottom: 16 }, analysisCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }, analysisCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }, analysisCardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, flex: 1 }, cardDesc: { fontSize: 13, color: COLORS.subtext }, keywordText: { fontSize: 12, color: COLORS.primary, fontWeight: '700', marginBottom: 10 }, slackBadge: { backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }, slackBadgeText: { fontSize: 10, color: COLORS.primary, fontWeight: '700' }, speakerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' }, speakerName: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.text }, summaryBadge: { backgroundColor: COLORS.secondary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }, summaryBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' }, summaryItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 }, summaryText: { fontSize: 13, color: COLORS.text, lineHeight: 20, flex: 1 }, segmentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' }, segmentSpeakerBadge: { backgroundColor: '#EEF2FF', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, flexShrink: 0 }, segmentSpeaker: { fontSize: 11, fontWeight: '700', color: COLORS.primary }, segmentTime: { fontSize: 10, color: COLORS.subtext, marginBottom: 2 }, segmentContent: { fontSize: 12, color: COLORS.text, lineHeight: 18, flex: 1 }, taskItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' }, taskDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success, marginTop: 5, flexShrink: 0 }, taskTitle: { fontSize: 13, fontWeight: '600', color: COLORS.text }, taskDue: { fontSize: 11, color: COLORS.warning, marginTop: 3 }, taskStatusPill: { backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 }, taskStatusText: { fontSize: 11, fontWeight: '700', color: COLORS.primary }, calendarAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 }, calendarAddText: { fontSize: 11, fontWeight: '700', color: COLORS.primary }, manualInput: { backgroundColor: '#F1F5F9', borderRadius: 12, height: 46, paddingHorizontal: 12, color: COLORS.text, marginBottom: 10 }, manualAddBtn: { height: 46, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }, manualAddBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' }, emptyAnalysisCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 28, alignItems: 'center', marginBottom: 24 }, emptyAnalysisTitle: { fontSize: 15, fontWeight: '700', color: COLORS.subtext, marginTop: 12 }, emptyAnalysisDesc: { fontSize: 12, color: '#A0AEC0', textAlign: 'center', marginTop: 5, lineHeight: 18 }, modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 32 }, modalCard: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 24, width: '100%' }, modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 14 }, memberPick: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: COLORS.border }, memberPickName: { fontSize: 14, fontWeight: '700', color: COLORS.text }, memberPickRole: { fontSize: 12, color: COLORS.subtext }, modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 }, modalCancelBtn: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }, modalCancelText: { fontSize: 15, fontWeight: '600', color: COLORS.subtext }, modalConfirmBtn: { flex: 1, height: 46, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }, modalConfirmText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
