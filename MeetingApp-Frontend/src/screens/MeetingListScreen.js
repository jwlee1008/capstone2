import React, { useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { COLORS } from '../theme';

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
const formatDate = (iso) => { const d = new Date(iso); return isNaN(d.getTime()) ? '날짜 없음' : `${d.getMonth() + 1}월 ${d.getDate()}일(${DAY_NAMES[d.getDay()]})`; };

function MeetingCard({ meeting, onPress }) {
  const latestSession = meeting.sessions[0];
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.78}>
      <View style={styles.cardLeft}>
        <View style={styles.cardAvatar}><Text style={styles.cardAvatarText}>{(meeting.name || '?').charAt(0)}</Text></View>
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle} numberOfLines={1}>{meeting.name}</Text>
          <View style={styles.cardMetaRow}><Ionicons name="people-outline" size={12} color={COLORS.subtext} /><Text style={styles.cardMeta} numberOfLines={1}>{(meeting.participants || []).join(', ')}</Text></View>
          <View style={styles.cardMetaRow}><Ionicons name="calendar-outline" size={12} color={COLORS.subtext} /><Text style={styles.cardMeta}>{formatDate(meeting.createdAt)}</Text></View>
          {latestSession && <View style={styles.latestSessionBadge}><Ionicons name="document-text-outline" size={10} color={COLORS.success} /><Text style={styles.latestSessionText}>최근: {latestSession.processStatus === 'done' ? '기록 정리 완료' : '기록 정리중'}</Text></View>}
        </View>
      </View>
      <View style={styles.cardRight}><View style={styles.sessionBadge}><Text style={styles.sessionBadgeText}>{meeting.sessions.length}</Text><Text style={styles.sessionBadgeLabel}>회</Text></View><Ionicons name="chevron-forward" size={16} color={COLORS.border} style={{ marginTop: 8 }} /></View>
    </TouchableOpacity>
  );
}

export default function MeetingListScreen({ navigation }) {
  const { workspace, workspaces, meetings, selectWorkspace } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [isSwitching, setIsSwitching] = useState(false);
  const normalizedQuery = searchQuery.toLowerCase();
  const filtered = meetings.filter((m) => (m.name || '').toLowerCase().includes(normalizedQuery) || (m.participants || []).some((p) => String(p).toLowerCase().includes(normalizedQuery))).sort((a, b) => sortBy === 'oldest' ? new Date(a.createdAt) - new Date(b.createdAt) : sortBy === 'name' ? a.name.localeCompare(b.name, 'ko') : new Date(b.createdAt) - new Date(a.createdAt));
  const activeWorkspaceId = workspace?.id ? String(workspace.id) : null;

  const handleSelectWorkspace = async (workspaceId) => {
    try {
      setIsSwitching(true);
      await selectWorkspace(workspaceId);
    } catch (error) {
      Alert.alert('전환 실패', error?.message || '워크스페이스를 전환하지 못했습니다.');
    } finally {
      setIsSwitching(false);
    }
  };

  const openCreateMeeting = () => {
    if (!workspace?.id) return Alert.alert('워크스페이스 선택', '회의를 만들 워크스페이스를 먼저 선택해주세요.');
    navigation.navigate('AddMeeting');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={styles.workspaceHeader}>
        <Text style={styles.headerLabel}>현재 워크스페이스</Text>
        <Text style={styles.headerTitle}>{workspace?.name || '선택된 워크스페이스 없음'}</Text>
        <View style={styles.workspaceList}>
          {workspaces.map((item) => {
            const isActive = activeWorkspaceId === String(item.id);
            return (
              <TouchableOpacity key={item.id} style={[styles.workspaceChip, isActive && styles.workspaceChipActive]} onPress={() => handleSelectWorkspace(item.id)} disabled={isSwitching}>
                <Text style={[styles.workspaceChipText, isActive && styles.workspaceChipTextActive]} numberOfLines={1}>{item.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <View style={styles.searchContainer}><View style={styles.searchBar}><Ionicons name="search-outline" size={16} color={COLORS.subtext} /><TextInput style={styles.searchInput} placeholder="회의 이름, 멤버 검색..." placeholderTextColor="#A0AEC0" value={searchQuery} onChangeText={setSearchQuery} />{searchQuery.length > 0 && <TouchableOpacity onPress={() => setSearchQuery('')}><Ionicons name="close-circle" size={16} color={COLORS.subtext} /></TouchableOpacity>}</View></View>
      <View style={styles.sortRow}><Text style={styles.sortLabel}>{workspace ? '이 워크스페이스 회의' : '회의'} <Text style={styles.sortCount}>{filtered.length}개</Text></Text><View style={styles.sortBtnGroup}>{['newest', 'oldest', 'name'].map((sort) => <TouchableOpacity key={sort} style={[styles.sortBtn, sortBy === sort && styles.sortBtnActive]} onPress={() => setSortBy(sort)}><Text style={[styles.sortBtnText, sortBy === sort && styles.sortBtnTextActive]}>{sort === 'newest' ? '최신순' : sort === 'oldest' ? '오래된순' : '이름순'}</Text></TouchableOpacity>)}</View></View>
      {!workspace ? <View style={styles.emptyContainer}><Ionicons name="business-outline" size={60} color={COLORS.border} /><Text style={styles.emptyTitle}>워크스페이스를 먼저 선택하세요</Text><Text style={styles.emptyDesc}>홈에서 팀을 만들거나 참여 중인 팀을 선택하면 그 안의 회의가 표시됩니다.</Text></View> : filtered.length === 0 ? <View style={styles.emptyContainer}><Ionicons name="calendar-outline" size={60} color={COLORS.border} /><Text style={styles.emptyTitle}>회의가 없어요</Text><Text style={styles.emptyDesc}>{workspace.name}에서 첫 회의를 만들어보세요.</Text></View> : <FlatList data={filtered} keyExtractor={(item) => String(item.id)} renderItem={({ item }) => <MeetingCard meeting={item} onPress={() => navigation.navigate('MeetingDetail', { meetingId: item.id, meetingName: item.name })} />} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} ItemSeparatorComponent={() => <View style={{ height: 10 }} />} />}
      <TouchableOpacity style={[styles.fab, !workspace && styles.fabDisabled]} onPress={openCreateMeeting} activeOpacity={0.88}><Ionicons name="add" size={28} color="#FFFFFF" /></TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background }, workspaceHeader: { backgroundColor: COLORS.surface, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border }, headerLabel: { fontSize: 11, fontWeight: '700', color: COLORS.primary, marginBottom: 3 }, headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text }, workspaceList: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }, workspaceChip: { maxWidth: '48%', borderRadius: 10, backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 7 }, workspaceChipActive: { backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: COLORS.primary }, workspaceChipText: { fontSize: 12, color: COLORS.subtext, fontWeight: '700' }, workspaceChipTextActive: { color: COLORS.primary }, searchContainer: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border }, searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 12, height: 42, gap: 8 }, searchInput: { flex: 1, fontSize: 14, color: COLORS.text }, sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 }, sortLabel: { fontSize: 13, color: COLORS.subtext, fontWeight: '500' }, sortCount: { color: COLORS.primary, fontWeight: '700' }, sortBtnGroup: { flexDirection: 'row', gap: 6 }, sortBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#F1F5F9' }, sortBtnActive: { backgroundColor: '#EEF2FF' }, sortBtnText: { fontSize: 11, color: COLORS.subtext, fontWeight: '500' }, sortBtnTextActive: { color: COLORS.primary, fontWeight: '700' }, listContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 100 }, card: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 3 }, cardLeft: { flexDirection: 'row', flex: 1, gap: 12 }, cardAvatar: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }, cardAvatarText: { fontSize: 20, fontWeight: '700', color: COLORS.primary }, cardContent: { flex: 1, gap: 3 }, cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 2 }, cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 }, cardMeta: { fontSize: 12, color: COLORS.subtext, flexShrink: 1 }, latestSessionBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, marginTop: 4, gap: 4, alignSelf: 'flex-start' }, latestSessionText: { fontSize: 10, color: COLORS.success, fontWeight: '500' }, cardRight: { alignItems: 'center', marginLeft: 8 }, sessionBadge: { alignItems: 'center', backgroundColor: '#EEF2FF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }, sessionBadgeText: { fontSize: 18, fontWeight: '700', color: COLORS.primary }, sessionBadgeLabel: { fontSize: 9, color: COLORS.primary, fontWeight: '600' }, emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }, emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.subtext, marginTop: 16 }, emptyDesc: { fontSize: 13, color: '#A0AEC0', textAlign: 'center', marginTop: 6 }, fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 10 }, fabDisabled: { opacity: 0.55 },
});
