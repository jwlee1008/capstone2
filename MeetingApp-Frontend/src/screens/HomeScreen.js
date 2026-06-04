import React, { useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import MeetingContextFields from '../components/MeetingContextFields';
import { COLORS } from '../theme';

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return '좋은 아침이에요';
  if (hour < 18) return '좋은 오후예요';
  return '좋은 저녁이에요';
}

function formatDate(isoString) {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '날짜 없음';
  return `${date.getMonth() + 1}월 ${date.getDate()}일(${DAY_NAMES[date.getDay()]})`;
}

export default function HomeScreen({ navigation }) {
  const {
    user,
    workspace,
    workspaces,
    invitations,
    meetings,
    calendarTasks,
    calendarEvents,
    createWorkspace,
    selectWorkspace,
    acceptInvitation,
    declineInvitation,
    inviteMember,
  } = useAppContext();
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceCategory, setWorkspaceCategory] = useState('');
  const [workspaceContext, setWorkspaceContext] = useState('');
  const [showWorkspaceContextModal, setShowWorkspaceContextModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const recentMeetings = meetings.slice(0, 3);
  const totalSessions = meetings.reduce((acc, meeting) => acc + meeting.sessions.length, 0);
  const activeWorkspaceId = workspace?.id ? String(workspace.id) : null;

  const openWorkspaceCreateModal = () => {
    const name = workspaceName.trim();
    if (!name) return Alert.alert('입력 오류', '워크스페이스 이름을 입력해주세요.');
    setShowWorkspaceContextModal(true);
  };

  const handleCreateWorkspace = async () => {
    const name = workspaceName.trim();
    if (!name) return Alert.alert('입력 오류', '워크스페이스 이름을 입력해주세요.');
    try {
      setPendingAction('createWorkspace');
      const created = await createWorkspace({
        name,
        meetingCategory: workspaceCategory.trim() || undefined,
        meetingContext: workspaceContext.trim() || undefined,
      });
      setWorkspaceName('');
      setWorkspaceCategory('');
      setWorkspaceContext('');
      setShowWorkspaceContextModal(false);
      Alert.alert('워크스페이스 생성 완료', `${created?.name || name} 워크스페이스를 선택했습니다.`);
    } catch (error) {
      Alert.alert('생성 실패', error?.message || '워크스페이스를 만들지 못했습니다.');
    } finally {
      setPendingAction(null);
    }
  };

  const handleSelectWorkspace = async (workspaceId) => {
    try {
      setPendingAction(`select-${workspaceId}`);
      await selectWorkspace(workspaceId);
    } catch (error) {
      Alert.alert('불러오기 실패', error?.message || '워크스페이스를 불러오지 못했습니다.');
    } finally {
      setPendingAction(null);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return Alert.alert('입력 오류', '초대할 이메일을 입력해주세요.');
    try {
      setPendingAction('invite');
      await inviteMember(inviteEmail);
      Alert.alert('초대 완료', '가입된 이메일로 초대를 보냈습니다.');
      setInviteEmail('');
    } catch (error) {
      Alert.alert('초대 실패', error?.message || '초대를 보내지 못했습니다.');
    } finally {
      setPendingAction(null);
    }
  };

  const openMeetings = () => {
    if (!workspace?.id) return Alert.alert('워크스페이스 선택', '회의를 만들거나 보려면 먼저 워크스페이스를 선택해주세요.');
    navigation.navigate('MeetingList');
  };

  const openCreateMeeting = () => {
    if (!workspace?.id) return Alert.alert('워크스페이스 선택', '회의를 만들 워크스페이스를 먼저 선택해주세요.');
    navigation.navigate('AddMeeting');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.userName}>{user?.name || '사용자'} 님</Text>
          </View>
        </View>

        {invitations.length > 0 && (
          <InviteInbox invitations={invitations} onAccept={acceptInvitation} onDecline={declineInvitation} />
        )}

        <View style={styles.workspaceCard}>
          {workspace && (
            <View style={styles.currentWorkspacePanel}>
              <View style={styles.workspaceHeaderRow}>
                <View style={{ flex: 1 }}><Text style={styles.workspaceLabel}>CURRENT WORKSPACE</Text><Text style={styles.currentWorkspaceName} numberOfLines={1}>{workspace.name}</Text></View>
                <View style={styles.memberBadge}><Text style={styles.memberBadgeText}>{workspace.members.length}명</Text></View>
              </View>
              <View style={styles.workspaceActions}>
                <TouchableOpacity style={styles.primaryActionBtn} onPress={openCreateMeeting} activeOpacity={0.86}><Ionicons name="add" size={18} color="#FFFFFF" /><Text style={styles.primaryActionText}>회의 만들기</Text></TouchableOpacity>
                <TouchableOpacity style={styles.secondaryActionBtn} onPress={openMeetings} activeOpacity={0.86}><Ionicons name="list-outline" size={16} color={COLORS.text} /><Text style={styles.secondaryActionText}>회의 목록</Text></TouchableOpacity>
              </View>
              <View style={styles.memberRow}>{workspace.members.length === 0 ? <Text style={styles.noMemberText}>멤버를 불러오는 중입니다.</Text> : workspace.members.map((member) => <View key={member.id} style={styles.memberChip}><Text style={styles.memberChipText}>{member.name}</Text></View>)}</View>
              <View style={styles.inviteRow}>
                <View style={[styles.inputWrap, styles.inviteInputWrap]}><TextInput value={inviteEmail} onChangeText={setInviteEmail} style={styles.input} placeholder="팀원 초대 이메일" placeholderTextColor={COLORS.subtext} autoCapitalize="none" keyboardType="email-address" /></View>
                <TouchableOpacity style={[styles.inviteBtn, pendingAction === 'invite' && styles.actionDisabled]} onPress={handleInvite} disabled={pendingAction === 'invite'}><Ionicons name="send" size={18} color="#FFFFFF" /></TouchableOpacity>
              </View>
              {workspace.invitedEmails.map((email) => <Text key={email} style={styles.invitedText}>초대 대기: {email}</Text>)}
            </View>
          )}
          <View style={styles.workspaceHeaderRow}>
            <View>
              <Text style={styles.workspaceLabel}>WORKSPACES</Text>
              <Text style={styles.workspaceTitle}>팀 전환</Text>
            </View>
            <View style={styles.memberBadge}><Text style={styles.memberBadgeText}>{workspaces.length}개</Text></View>
          </View>
          <View style={styles.createWorkspaceRow}>
            <View style={[styles.inputWrap, styles.createWorkspaceInput]}><TextInput value={workspaceName} onChangeText={setWorkspaceName} style={styles.input} placeholder="새 워크스페이스 이름" placeholderTextColor={COLORS.subtext} /></View>
            <TouchableOpacity style={[styles.createWorkspaceIconBtn, pendingAction === 'createWorkspace' && styles.actionDisabled]} onPress={openWorkspaceCreateModal} activeOpacity={0.85} disabled={pendingAction === 'createWorkspace'}><Ionicons name="add" size={22} color="#FFFFFF" /></TouchableOpacity>
          </View>
          {workspaces.length === 0 ? (
            <View style={styles.emptyWorkspaceBox}><Text style={styles.emptyWorkspaceText}>워크스페이스를 만들면 회의를 생성할 수 있어요.</Text></View>
          ) : (
            <View style={styles.workspaceGrid}>
              {workspaces.map((item) => {
                const isActive = activeWorkspaceId === String(item.id);
                return (
                  <TouchableOpacity key={item.id} style={[styles.workspaceListItem, isActive && styles.workspaceListItemActive]} onPress={() => handleSelectWorkspace(item.id)} disabled={Boolean(pendingAction)}>
                    <View style={styles.workspaceListLeft}>
                      <View style={[styles.workspaceDot, isActive && styles.workspaceDotActive]} />
                      <View style={{ flex: 1 }}><Text style={styles.workspaceListName} numberOfLines={1}>{item.name}</Text><Text style={styles.workspaceListMeta}>{isActive ? '사용 중' : item.ownerName || '팀'}</Text></View>
                    </View>
                    {isActive ? <Ionicons name="checkmark-circle" size={19} color={COLORS.primary} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.statsRow}>
          <Stat icon="people-outline" bg={COLORS.chip} color={COLORS.primary} value={meetings.length} label="전체 회의" />
          <Stat icon="checkmark-circle-outline" bg="#F0FDF4" color={COLORS.success} value={totalSessions} label="완료 세션" />
          <Stat icon="calendar-outline" bg="#FFFBEB" color={COLORS.warning} value={calendarTasks.length + calendarEvents.length} label="할일/일정" />
        </View>

        <TouchableOpacity style={[styles.meetingMainButton, !workspace && styles.meetingMainButtonDisabled]} onPress={openMeetings} activeOpacity={0.88}>
          <View style={styles.meetingMainLeft}>
            <View style={styles.meetingMainIconWrap}><Ionicons name="mic-outline" size={25} color={COLORS.primary} /></View>
            <View style={styles.meetingMainTextWrap}><Text style={styles.meetingMainTitle}>회의 관리</Text><Text style={styles.meetingMainDesc}>녹음, 대화록, 할일을 차분하게 정리합니다</Text></View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.subtext} />
        </TouchableOpacity>

        <View style={styles.noticeBanner}>
          <View style={styles.noticeLeft}>
            <View style={styles.noticeBadge}><Ionicons name="sparkles-outline" size={13} color={COLORS.secondary} /><Text style={styles.noticeBadgeText}>정리</Text></View>
            <View style={{ flex: 1 }}><Text style={styles.noticeTitle}>회의 흐름을 놓치지 않게</Text><Text style={styles.noticeDesc}>요약, 화자, 할일을 필요한 순간에만 보여줍니다</Text></View>
          </View>
        </View>

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{workspace ? `${workspace.name} 최근 회의` : '최근 회의'}</Text><TouchableOpacity onPress={openMeetings}><Text style={styles.seeAllText}>전체 보기</Text></TouchableOpacity></View>
        {recentMeetings.length === 0 ? (
          <View style={styles.emptyCard}><Ionicons name="calendar-outline" size={40} color={COLORS.border} /><Text style={styles.emptyText}>아직 회의가 없어요</Text><Text style={styles.emptySubtext}>워크스페이스 생성 후 Meeting 버튼을 눌러 회의를 만들어보세요</Text></View>
        ) : recentMeetings.map((meeting) => (
          <TouchableOpacity key={meeting.id} style={styles.recentMeetingCard} onPress={() => navigation.navigate('MeetingDetail', { meetingId: meeting.id, meetingName: meeting.name })} activeOpacity={0.75}>
            <View style={styles.recentCardLeft}><View style={styles.recentAvatarCircle}><Text style={styles.recentAvatarText}>{(meeting.name || '?').charAt(0)}</Text></View><View style={{ flex: 1 }}><Text style={styles.recentMeetingName} numberOfLines={1}>{meeting.name}</Text><Text style={styles.recentMeetingMeta}>{formatDate(meeting.createdAt)} · {(meeting.participants || []).length}명</Text></View></View>
            <View style={styles.sessionCountBadge}><Text style={styles.sessionCountText}>{meeting.sessions.length}회</Text></View>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <WorkspaceContextModal
        visible={showWorkspaceContextModal}
        workspaceName={workspaceName.trim()}
        category={workspaceCategory}
        context={workspaceContext}
        onChangeCategory={setWorkspaceCategory}
        onChangeContext={setWorkspaceContext}
        onClose={() => {
          if (pendingAction === 'createWorkspace') return;
          setShowWorkspaceContextModal(false);
        }}
        onCreate={handleCreateWorkspace}
        saving={pendingAction === 'createWorkspace'}
      />
    </SafeAreaView>
  );
}

function Stat({ icon, bg, color, value, label }) {
  return <View style={styles.statCard}><View style={[styles.statIconWrap, { backgroundColor: bg }]}><Ionicons name={icon} size={20} color={color} /></View><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function InviteInbox({ invitations, onAccept, onDecline }) {
  const handleAccept = async (id) => {
    try {
      await onAccept(id);
      Alert.alert('초대 수락', '워크스페이스와 회의 목록을 불러왔습니다.');
    } catch (error) {
      Alert.alert('수락 실패', error?.message || '초대를 수락하지 못했습니다.');
    }
  };

  const handleDecline = async (id) => {
    try {
      await onDecline(id);
    } catch (error) {
      Alert.alert('거절 실패', error?.message || '초대를 거절하지 못했습니다.');
    }
  };

  return (
    <View style={styles.inviteInbox}>
      <Text style={styles.inviteInboxTitle}>받은 초대함</Text>
      {invitations.map((item) => (
        <View key={item.id} style={styles.inviteInboxRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.workspaceListName}>{item.workspaceName}</Text>
            <Text style={styles.workspaceListMeta}>{item.inviterName} 님의 초대</Text>
          </View>
          <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAccept(item.id)}><Text style={styles.acceptText}>수락</Text></TouchableOpacity>
          <TouchableOpacity style={styles.declineBtn} onPress={() => handleDecline(item.id)}><Text style={styles.declineText}>거절</Text></TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

function WorkspaceContextModal({
  visible,
  workspaceName,
  category,
  context,
  onChangeCategory,
  onChangeContext,
  onClose,
  onCreate,
  saving,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={saving ? undefined : onClose}>
        <TouchableOpacity style={styles.modalCard} activeOpacity={1}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalEyebrow}>WORKSPACE</Text>
              <Text style={styles.modalTitle} numberOfLines={1}>{workspaceName}</Text>
            </View>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose} disabled={saving} activeOpacity={0.78}>
              <Ionicons name="close" size={18} color={COLORS.subtext} />
            </TouchableOpacity>
          </View>
          <MeetingContextFields
            category={category}
            context={context}
            onChangeCategory={onChangeCategory}
            onChangeContext={onChangeContext}
          />
          <View style={styles.modalActions}>
            <TouchableOpacity style={[styles.modalCancelBtn, saving && styles.actionDisabled]} onPress={onClose} disabled={saving} activeOpacity={0.82}>
              <Text style={styles.modalCancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalCreateBtn, saving && styles.actionDisabled]} onPress={onCreate} disabled={saving} activeOpacity={0.82}>
              <Text style={styles.modalCreateText}>{saving ? '생성 중' : '생성'}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background }, scrollView: { flex: 1 }, scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingTop: 8 }, greeting: { fontSize: 14, color: COLORS.subtext, marginBottom: 2 }, userName: { fontSize: 22, fontWeight: '700', color: COLORS.text, letterSpacing: 0 },
  workspaceCard: { backgroundColor: COLORS.surface, borderRadius: 8, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border }, workspaceIconWrap: { width: 44, height: 44, borderRadius: 8, backgroundColor: COLORS.chip, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }, workspaceHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, workspaceLabel: { fontSize: 11, fontWeight: '800', color: COLORS.primary, marginBottom: 3 }, workspaceTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text }, workspaceDesc: { fontSize: 13, color: COLORS.subtext, lineHeight: 19, marginTop: 6, marginBottom: 14 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 12, height: 46 }, input: { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: '700' }, createWorkspaceBtn: { height: 48, borderRadius: 8, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginTop: 12 }, createWorkspaceText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  createWorkspaceRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 14 }, createWorkspaceInput: { flex: 1 }, createWorkspaceIconBtn: { width: 46, height: 46, borderRadius: 8, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  memberBadge: { backgroundColor: COLORS.chip, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }, memberBadgeText: { color: COLORS.primary, fontWeight: '800', fontSize: 12 }, memberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }, memberChip: { backgroundColor: COLORS.inputBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }, memberChipText: { color: COLORS.text, fontWeight: '700', fontSize: 12 }, noMemberText: { color: COLORS.subtext, fontSize: 12 }, inviteRow: { flexDirection: 'row', gap: 8, marginTop: 14 }, inviteInputWrap: { flex: 1 }, inviteBtn: { width: 46, height: 46, borderRadius: 8, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }, actionDisabled: { opacity: 0.6 }, invitedText: { fontSize: 12, color: COLORS.subtext, marginTop: 8 },
  currentWorkspacePanel: { backgroundColor: COLORS.surfaceAlt, borderRadius: 8, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border }, currentWorkspaceName: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  workspaceActions: { flexDirection: 'row', gap: 8, marginTop: 14 }, primaryActionBtn: { flex: 1, height: 44, borderRadius: 8, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, primaryActionText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 }, secondaryActionBtn: { height: 44, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }, secondaryActionText: { color: COLORS.text, fontWeight: '800', fontSize: 13 },
  emptyWorkspaceBox: { backgroundColor: COLORS.surfaceAlt, borderRadius: 8, padding: 14, borderWidth: 1, borderColor: COLORS.border }, emptyWorkspaceText: { color: COLORS.subtext, fontSize: 13 },
  workspaceGrid: { gap: 8 },
  workspaceListItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, backgroundColor: '#FFFFFF' },
  workspaceListItemActive: { backgroundColor: COLORS.chip, borderColor: COLORS.primary },
  workspaceListLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  workspaceDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.border },
  workspaceDotActive: { backgroundColor: COLORS.primary },
  workspaceListName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  workspaceListMeta: { fontSize: 11, color: COLORS.subtext, marginTop: 2 },
  inviteInbox: { marginTop: 12, marginBottom: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  inviteInboxTitle: { fontSize: 12, fontWeight: '700', color: COLORS.primary, marginTop: 12, marginBottom: 4 },
  inviteInboxRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8 },
  acceptBtn: { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  acceptText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  declineBtn: { backgroundColor: COLORS.inputBg, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  declineText: { color: COLORS.subtext, fontSize: 11, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.45)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  modalCard: { width: '100%', maxHeight: '86%', backgroundColor: COLORS.surface, borderRadius: 8, padding: 18, borderWidth: 1, borderColor: COLORS.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  modalEyebrow: { fontSize: 11, fontWeight: '800', color: COLORS.primary, marginBottom: 3 },
  modalTitle: { maxWidth: 250, fontSize: 20, fontWeight: '800', color: COLORS.text },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.inputBg, alignItems: 'center', justifyContent: 'center' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  modalCancelBtn: { flex: 1, height: 46, borderRadius: 8, backgroundColor: COLORS.inputBg, alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { fontSize: 14, color: COLORS.subtext, fontWeight: '800' },
  modalCreateBtn: { flex: 1, height: 46, borderRadius: 8, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  modalCreateText: { fontSize: 14, color: '#FFFFFF', fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 }, statCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 8, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }, statIconWrap: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }, statValue: { fontSize: 20, fontWeight: '800', color: COLORS.text }, statLabel: { fontSize: 11, color: COLORS.subtext, marginTop: 2, textAlign: 'center', fontWeight: '700' },
  meetingMainButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderRadius: 8, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border }, meetingMainButtonDisabled: { opacity: 0.55 }, meetingMainLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 }, meetingMainIconWrap: { width: 48, height: 48, borderRadius: 8, backgroundColor: COLORS.chip, alignItems: 'center', justifyContent: 'center', marginRight: 14 }, meetingMainTextWrap: { flex: 1 }, meetingMainTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, letterSpacing: 0 }, meetingMainDesc: { fontSize: 12, color: COLORS.subtext, marginTop: 3 },
  noticeBanner: { backgroundColor: '#F0FDFA', borderRadius: 8, padding: 14, marginBottom: 22, borderWidth: 1, borderColor: '#CCFBF1' }, noticeLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 }, noticeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#CCFBF1', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, gap: 3 }, noticeBadgeText: { color: COLORS.secondary, fontSize: 11, fontWeight: '800' }, noticeTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text }, noticeDesc: { fontSize: 11, color: COLORS.subtext, marginTop: 1 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }, sectionTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text, marginBottom: 12 }, seeAllText: { fontSize: 13, color: COLORS.primary, fontWeight: '700' }, emptyCard: { backgroundColor: COLORS.surface, borderRadius: 8, padding: 32, alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: COLORS.border }, emptyText: { fontSize: 15, fontWeight: '700', color: COLORS.subtext, marginTop: 12 }, emptySubtext: { fontSize: 12, color: COLORS.muted, marginTop: 4, textAlign: 'center' }, recentMeetingCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderRadius: 8, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border }, recentCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }, recentAvatarCircle: { width: 42, height: 42, borderRadius: 8, backgroundColor: COLORS.chip, alignItems: 'center', justifyContent: 'center' }, recentAvatarText: { fontSize: 18, fontWeight: '800', color: COLORS.primary }, recentMeetingName: { fontSize: 15, fontWeight: '700', color: COLORS.text }, recentMeetingMeta: { fontSize: 12, color: COLORS.subtext, marginTop: 2 }, sessionCountBadge: { backgroundColor: COLORS.chip, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 4 }, sessionCountText: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
});
