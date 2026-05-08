import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { CARD_SHADOW, COLORS } from '../theme';

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
  const { user, workspace, meetings, calendarTasks, createWorkspace, inviteMember } = useAppContext();
  const [workspaceName, setWorkspaceName] = useState('프론트엔드 캡스톤 팀');
  const [inviteEmail, setInviteEmail] = useState('');
  const recentMeetings = meetings.slice(0, 3);
  const totalSessions = meetings.reduce((acc, meeting) => acc + meeting.sessions.length, 0);

  const handleInvite = () => {
    if (!inviteEmail.trim()) return Alert.alert('입력 오류', '초대할 이메일을 입력해주세요.');
    inviteMember(inviteEmail);
    setInviteEmail('');
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

        {!workspace ? (
          <View style={styles.workspaceCard}>
            <View style={styles.workspaceIconWrap}><Ionicons name="people-outline" size={24} color={COLORS.primary} /></View>
            <Text style={styles.workspaceTitle}>워크스페이스 생성</Text>
            <Text style={styles.workspaceDesc}>팀 워크스페이스를 만들고 멤버를 초대해 회의 기록을 함께 관리하세요.</Text>
            <View style={styles.inputWrap}><TextInput value={workspaceName} onChangeText={setWorkspaceName} style={styles.input} placeholder="워크스페이스 이름" /></View>
            <TouchableOpacity style={styles.createWorkspaceBtn} onPress={() => createWorkspace(workspaceName)} activeOpacity={0.85}><Text style={styles.createWorkspaceText}>워크스페이스 만들기</Text></TouchableOpacity>
          </View>
        ) : (
          <View style={styles.workspaceCard}>
            <View style={styles.workspaceHeaderRow}>
              <View><Text style={styles.workspaceLabel}>WORKSPACE</Text><Text style={styles.workspaceTitle}>{workspace.name}</Text></View>
              <View style={styles.memberBadge}><Text style={styles.memberBadgeText}>{workspace.members.length}명</Text></View>
            </View>
            <View style={styles.memberRow}>{workspace.members.map((member) => <View key={member.id} style={styles.memberChip}><Text style={styles.memberChipText}>{member.name}</Text></View>)}</View>
            <View style={styles.inviteRow}>
              <View style={[styles.inputWrap, styles.inviteInputWrap]}><TextInput value={inviteEmail} onChangeText={setInviteEmail} style={styles.input} placeholder="초대 이메일" autoCapitalize="none" /></View>
              <TouchableOpacity style={styles.inviteBtn} onPress={handleInvite}><Ionicons name="send" size={18} color="#FFFFFF" /></TouchableOpacity>
            </View>
            {workspace.invitedEmails.map((email) => <Text key={email} style={styles.invitedText}>초대 대기: {email}</Text>)}
          </View>
        )}

        <View style={styles.statsRow}>
          <Stat icon="people-outline" bg="#EEF2FF" color={COLORS.primary} value={meetings.length} label="전체 회의" />
          <Stat icon="checkmark-circle-outline" bg="#F0FDF4" color={COLORS.success} value={totalSessions} label="완료 세션" />
          <Stat icon="calendar-outline" bg="#FFFBEB" color={COLORS.warning} value={calendarTasks.length} label="등록 할일" />
        </View>

        <TouchableOpacity style={styles.meetingMainButton} onPress={() => navigation.navigate('MeetingList')} activeOpacity={0.88}>
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

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>최근 회의</Text><TouchableOpacity onPress={() => navigation.navigate('MeetingList')}><Text style={styles.seeAllText}>전체 보기</Text></TouchableOpacity></View>
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background }, scrollView: { flex: 1 }, scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingTop: 8 }, greeting: { fontSize: 14, color: COLORS.subtext, marginBottom: 2 }, userName: { fontSize: 22, fontWeight: '700', color: COLORS.text, letterSpacing: 0 },
  workspaceCard: { backgroundColor: COLORS.surface, borderRadius: 18, padding: 18, marginBottom: 18, ...CARD_SHADOW }, workspaceIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }, workspaceHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, workspaceLabel: { fontSize: 11, fontWeight: '700', color: COLORS.primary, marginBottom: 3 }, workspaceTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text }, workspaceDesc: { fontSize: 13, color: COLORS.subtext, lineHeight: 19, marginTop: 6, marginBottom: 14 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.inputBg, borderRadius: 12, borderWidth: 1.5, borderColor: 'transparent', paddingHorizontal: 12, height: 48 }, input: { flex: 1, color: COLORS.text, fontSize: 14 }, createWorkspaceBtn: { height: 50, borderRadius: 14, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginTop: 12 }, createWorkspaceText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  memberBadge: { backgroundColor: '#EEF2FF', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 5 }, memberBadgeText: { color: COLORS.primary, fontWeight: '700', fontSize: 12 }, memberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }, memberChip: { backgroundColor: '#F1F5F9', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 }, memberChipText: { color: COLORS.text, fontWeight: '600', fontSize: 12 }, inviteRow: { flexDirection: 'row', gap: 8, marginTop: 14 }, inviteInputWrap: { flex: 1 }, inviteBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }, invitedText: { fontSize: 12, color: COLORS.subtext, marginTop: 8 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 }, statCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }, statIconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }, statValue: { fontSize: 20, fontWeight: '700', color: COLORS.text }, statLabel: { fontSize: 11, color: COLORS.subtext, marginTop: 2, textAlign: 'center' },
  meetingMainButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.primary, borderRadius: 20, padding: 20, marginBottom: 16, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 10 }, meetingMainLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 }, meetingMainIconWrap: { width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 16 }, meetingMainTextWrap: { flex: 1 }, meetingMainTitle: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0 }, meetingMainDesc: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 3 },
  noticeBanner: { backgroundColor: '#FDF4FF', borderRadius: 14, padding: 14, marginBottom: 24, borderWidth: 1, borderColor: '#E9D5FF' }, noticeLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 }, noticeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.secondary, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, gap: 3 }, noticeBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' }, noticeTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text }, noticeDesc: { fontSize: 11, color: COLORS.subtext, marginTop: 1 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }, sectionTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginBottom: 12 }, seeAllText: { fontSize: 13, color: COLORS.primary, fontWeight: '600' }, emptyCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 32, alignItems: 'center', marginBottom: 24 }, emptyText: { fontSize: 15, fontWeight: '600', color: COLORS.subtext, marginTop: 12 }, emptySubtext: { fontSize: 12, color: '#A0AEC0', marginTop: 4, textAlign: 'center' }, recentMeetingCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, marginBottom: 10, ...CARD_SHADOW }, recentCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }, recentAvatarCircle: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }, recentAvatarText: { fontSize: 18, fontWeight: '700', color: COLORS.primary }, recentMeetingName: { fontSize: 15, fontWeight: '600', color: COLORS.text }, recentMeetingMeta: { fontSize: 12, color: COLORS.subtext, marginTop: 2 }, sessionCountBadge: { backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }, sessionCountText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
});
