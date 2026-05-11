import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { CARD_SHADOW, COLORS } from '../theme';
import UserInviteSearch from '../components/UserInviteSearch';

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
    deleteWorkspace,
    selectWorkspace,
    acceptInvitation,
    declineInvitation,
    inviteMember,
  } = useAppContext();
  const [workspaceName, setWorkspaceName] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const recentMeetings = meetings.slice(0, 3);
  const totalSessions = meetings.reduce((acc, meeting) => acc + meeting.sessions.length, 0);
  const activeWorkspaceId = workspace?.id ? String(workspace.id) : null;

  const handleCreateWorkspace = async () => {
    const name = workspaceName.trim();
    if (!name) return Alert.alert('입력 오류', '워크스페이스 이름을 입력해주세요.');
    try {
      setPendingAction('createWorkspace');
      const created = await createWorkspace(name);
      setWorkspaceName('');
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

  const handleDeleteWorkspace = async () => {
    if (!workspace?.id) return;
    const runDelete = async () => {
      try {
        setPendingAction(`delete-workspace-${workspace.id}`);
        await deleteWorkspace(workspace.id);
        Alert.alert('삭제 완료', '워크스페이스를 삭제했습니다.');
      } catch (error) {
        Alert.alert('삭제 실패', error?.message || '워크스페이스를 삭제하지 못했습니다.');
      } finally {
        setPendingAction(null);
      }
    };

    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`${workspace.name} 워크스페이스를 삭제할까요?`)) await runDelete();
      return;
    }
    Alert.alert('워크스페이스 삭제', `${workspace.name} 워크스페이스를 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: runDelete },
    ]);
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
                <TouchableOpacity style={styles.primaryActionBtn} onPress={openCreateMeeting} activeOpacity={0.86}><Ionicons name="add-circle-outline" size={18} color="#FFFFFF" /><Text style={styles.primaryActionText}>회의 만들기</Text></TouchableOpacity>
                <TouchableOpacity style={styles.secondaryActionBtn} onPress={openMeetings} activeOpacity={0.86}><Text style={styles.secondaryActionText}>회의 목록</Text></TouchableOpacity>
                <TouchableOpacity style={styles.dangerIconBtn} onPress={handleDeleteWorkspace} activeOpacity={0.86} disabled={pendingAction === `delete-workspace-${workspace.id}`}><Ionicons name="trash-outline" size={18} color={COLORS.error} /></TouchableOpacity>
              </View>
              <View style={styles.memberRow}>{workspace.members.length === 0 ? <Text style={styles.noMemberText}>멤버를 불러오는 중입니다.</Text> : workspace.members.map((member) => <View key={member.id} style={styles.memberChip}><Text style={styles.memberChipText}>{member.name}</Text></View>)}</View>
              <View style={styles.inviteRow}>
                <UserInviteSearch
                  description="이름이나 이메일로 가입된 사용자를 검색한 뒤 선택해서 초대하세요."
                  invitedEmails={workspace.invitedEmails}
                  onInvite={inviteMember}
                />
              </View>
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
            <View style={[styles.inputWrap, styles.createWorkspaceInput]}><TextInput value={workspaceName} onChangeText={setWorkspaceName} style={styles.input} placeholder="새 워크스페이스 이름" /></View>
            <TouchableOpacity style={[styles.createWorkspaceIconBtn, pendingAction === 'createWorkspace' && styles.actionDisabled]} onPress={handleCreateWorkspace} activeOpacity={0.85} disabled={pendingAction === 'createWorkspace'}><Ionicons name="add" size={22} color="#FFFFFF" /></TouchableOpacity>
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
          <Stat icon="people-outline" bg="#EEF2FF" color={COLORS.primary} value={meetings.length} label="전체 회의" />
          <Stat icon="checkmark-circle-outline" bg="#F0FDF4" color={COLORS.success} value={totalSessions} label="완료 세션" />
          <Stat icon="calendar-outline" bg="#FFFBEB" color={COLORS.warning} value={calendarTasks.length + calendarEvents.length} label="할일/일정" />
        </View>

        <TouchableOpacity style={[styles.meetingMainButton, !workspace && styles.meetingMainButtonDisabled]} onPress={openMeetings} activeOpacity={0.88}>
          <View style={styles.meetingMainLeft}>
            <View style={styles.meetingMainIconWrap}><Ionicons name="videocam" size={31} color="#FFFFFF" /></View>
            <View style={styles.meetingMainTextWrap}><Text style={styles.meetingMainTitle}>Meeting</Text><Text style={styles.meetingMainDesc}>녹음 파일을 올리고 기록과 할일을 확인하세요</Text></View>
          </View>
          <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        <View style={styles.noticeBanner}>
          <View style={styles.noticeLeft}>
            <View style={styles.noticeBadge}><Ionicons name="sparkles" size={13} color="#FFFFFF" /><Text style={styles.noticeBadgeText}>NEW</Text></View>
            <View style={{ flex: 1 }}><Text style={styles.noticeTitle}>회의 정리</Text><Text style={styles.noticeDesc}>대화록, 요약, 할일을 한 화면에서 확인합니다</Text></View>
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background }, scrollView: { flex: 1 }, scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingTop: 8 }, greeting: { fontSize: 14, color: COLORS.subtext, marginBottom: 2 }, userName: { fontSize: 22, fontWeight: '700', color: COLORS.text, letterSpacing: 0 },
  workspaceCard: { backgroundColor: COLORS.surface, borderRadius: 18, padding: 18, marginBottom: 18, ...CARD_SHADOW }, workspaceIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }, workspaceHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, workspaceLabel: { fontSize: 11, fontWeight: '700', color: COLORS.primary, marginBottom: 3 }, workspaceTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text }, workspaceDesc: { fontSize: 13, color: COLORS.subtext, lineHeight: 19, marginTop: 6, marginBottom: 14 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.inputBg, borderRadius: 12, borderWidth: 1.5, borderColor: 'transparent', paddingHorizontal: 12, height: 48 }, input: { flex: 1, color: COLORS.text, fontSize: 14 }, createWorkspaceBtn: { height: 50, borderRadius: 14, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginTop: 12 }, createWorkspaceText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  createWorkspaceRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 12 }, createWorkspaceInput: { flex: 1 }, createWorkspaceIconBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  memberBadge: { backgroundColor: '#EEF2FF', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 5 }, memberBadgeText: { color: COLORS.primary, fontWeight: '700', fontSize: 12 }, memberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }, memberChip: { backgroundColor: '#F1F5F9', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 }, memberChipText: { color: COLORS.text, fontWeight: '600', fontSize: 12 }, noMemberText: { color: COLORS.subtext, fontSize: 12 }, inviteRow: { flexDirection: 'row', gap: 8, marginTop: 14 }, inviteInputWrap: { flex: 1 }, inviteBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }, actionDisabled: { opacity: 0.6 }, invitedText: { fontSize: 12, color: COLORS.subtext, marginTop: 8 },
  currentWorkspacePanel: { backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border }, currentWorkspaceName: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  workspaceActions: { flexDirection: 'row', gap: 8, marginTop: 14 }, primaryActionBtn: { flex: 1, height: 46, borderRadius: 12, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, primaryActionText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 }, secondaryActionBtn: { height: 46, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' }, secondaryActionText: { color: COLORS.text, fontWeight: '700', fontSize: 13 },
  dangerIconBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', alignItems: 'center', justifyContent: 'center' },
  emptyWorkspaceBox: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border }, emptyWorkspaceText: { color: COLORS.subtext, fontSize: 13 },
  workspaceGrid: { gap: 8 },
  workspaceListItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: '#FFFFFF' },
  workspaceListItemActive: { backgroundColor: '#EEF2FF', borderColor: COLORS.primary },
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
  declineBtn: { backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  declineText: { color: COLORS.subtext, fontSize: 11, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 }, statCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }, statIconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }, statValue: { fontSize: 20, fontWeight: '700', color: COLORS.text }, statLabel: { fontSize: 11, color: COLORS.subtext, marginTop: 2, textAlign: 'center' },
  meetingMainButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.primary, borderRadius: 20, padding: 20, marginBottom: 16, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 10 }, meetingMainButtonDisabled: { opacity: 0.55 }, meetingMainLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 }, meetingMainIconWrap: { width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 16 }, meetingMainTextWrap: { flex: 1 }, meetingMainTitle: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0 }, meetingMainDesc: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 3 },
  noticeBanner: { backgroundColor: '#FDF4FF', borderRadius: 14, padding: 14, marginBottom: 24, borderWidth: 1, borderColor: '#E9D5FF' }, noticeLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 }, noticeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.secondary, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, gap: 3 }, noticeBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' }, noticeTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text }, noticeDesc: { fontSize: 11, color: COLORS.subtext, marginTop: 1 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }, sectionTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginBottom: 12 }, seeAllText: { fontSize: 13, color: COLORS.primary, fontWeight: '600' }, emptyCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 32, alignItems: 'center', marginBottom: 24 }, emptyText: { fontSize: 15, fontWeight: '600', color: COLORS.subtext, marginTop: 12 }, emptySubtext: { fontSize: 12, color: '#A0AEC0', marginTop: 4, textAlign: 'center' }, recentMeetingCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, marginBottom: 10, ...CARD_SHADOW }, recentCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }, recentAvatarCircle: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }, recentAvatarText: { fontSize: 18, fontWeight: '700', color: COLORS.primary }, recentMeetingName: { fontSize: 15, fontWeight: '600', color: COLORS.text }, recentMeetingMeta: { fontSize: 12, color: COLORS.subtext, marginTop: 2 }, sessionCountBadge: { backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }, sessionCountText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
});
