import React, { useEffect, useState } from 'react';
import { Alert, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import MeetingContextFields from '../components/MeetingContextFields';
import { COLORS } from '../theme';

function SettingRow({ icon, iconBg, iconColor, label, value, onPress, hasArrow = true }) { return <TouchableOpacity style={styles.settingRow} onPress={onPress} activeOpacity={0.7} disabled={!onPress}><View style={[styles.settingIconWrap, { backgroundColor: iconBg || COLORS.inputBg }]}><Ionicons name={icon} size={18} color={iconColor || COLORS.subtext} /></View><View style={styles.settingInfo}><Text style={styles.settingLabel}>{label}</Text>{value ? <Text style={styles.settingValue}>{value}</Text> : null}</View>{hasArrow && <Ionicons name="chevron-forward" size={16} color={COLORS.border} />}</TouchableOpacity>; }
function SectionCard({ title, children }) { return <View style={styles.sectionCard}><Text style={styles.sectionTitle}>{title}</Text><View>{children}</View></View>; }

export default function MyInfoScreen() {
  const { user, workspace, meetings, calendarTasks, logout, updateUser, updateWorkspaceSettings } = useAppContext();
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showWorkspaceContextModal, setShowWorkspaceContextModal] = useState(false);
  const [isSavingWorkspaceContext, setIsSavingWorkspaceContext] = useState(false);
  const totalSessions = meetings.reduce((acc, meeting) => acc + meeting.sessions.length, 0);
  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('정말 로그아웃 하시겠어요?')) logout();
      return;
    }
    Alert.alert('로그아웃', '정말 로그아웃 하시겠어요?', [{ text: '취소', style: 'cancel' }, { text: '로그아웃', style: 'destructive', onPress: logout }]);
  };
  const handleSaveProfile = async (updates) => {
    try {
      await updateUser(updates);
      Alert.alert('저장 완료', '프로필이 업데이트되었습니다.');
    } catch (error) {
      Alert.alert('저장 실패', error?.message || '프로필을 업데이트하지 못했습니다.');
    }
  };
  const handleSaveWorkspaceContext = async (updates) => {
    try {
      setIsSavingWorkspaceContext(true);
      await updateWorkspaceSettings(updates);
      setShowWorkspaceContextModal(false);
      Alert.alert('저장 완료', '워크스페이스 설정이 업데이트되었습니다.');
    } catch (error) {
      Alert.alert('저장 실패', error?.message || '워크스페이스 설정을 업데이트하지 못했습니다.');
    } finally {
      setIsSavingWorkspaceContext(false);
    }
  };
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.profileHeader}><View style={styles.profileAvatarWrap}><View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>{user?.name?.charAt(0) || 'U'}</Text></View><TouchableOpacity style={styles.editAvatarBtn} onPress={() => Alert.alert('안내', '프로필 사진 기능은 준비 중입니다.')}><Ionicons name="camera" size={14} color="#FFFFFF" /></TouchableOpacity></View><Text style={styles.profileName}>{user?.name || '사용자'}</Text><Text style={styles.profileEmail}>{user?.email || 'user@meno.app'}</Text><View style={styles.profileRoleBadge}><Text style={styles.profileRoleText}>{user?.role || '서비스 운영'}</Text></View><TouchableOpacity style={styles.editProfileBtn} activeOpacity={0.85} onPress={() => setShowEditProfileModal(true)}><Ionicons name="pencil-outline" size={14} color={COLORS.primary} /><Text style={styles.editProfileText}>프로필 편집</Text></TouchableOpacity></View>
        <View style={styles.statsCard}><Stat value={meetings.length} label="전체 회의" /><View style={styles.statDivider} /><Stat value={totalSessions} label="총 세션" /><View style={styles.statDivider} /><Stat value={calendarTasks.length} label="할일" /></View>
        <SectionCard title="워크스페이스"><SettingRow icon="business-outline" iconBg={COLORS.chip} iconColor={COLORS.primary} label="현재 워크스페이스" value={workspace?.name || '생성 전'} hasArrow={false} /><View style={styles.rowDivider} /><SettingRow icon="people-outline" iconBg="#ECFDF5" iconColor={COLORS.success} label="멤버 수" value={`${workspace?.members?.length || 0}명`} hasArrow={false} /><View style={styles.rowDivider} /><SettingRow icon="sparkles-outline" iconBg="#F0FDFA" iconColor={COLORS.secondary} label="회의 카테고리" value={workspace?.meetingCategory || '설정 안 됨'} onPress={workspace ? () => setShowWorkspaceContextModal(true) : undefined} hasArrow={Boolean(workspace)} /><View style={styles.rowDivider} /><SettingRow icon="document-text-outline" iconBg={COLORS.inputBg} iconColor={COLORS.subtext} label="추가 문맥" value={workspace?.meetingContext || '설정 안 됨'} onPress={workspace ? () => setShowWorkspaceContextModal(true) : undefined} hasArrow={Boolean(workspace)} /></SectionCard>
        <SectionCard title="서비스 설정"><SettingRow icon="key-outline" iconBg={COLORS.chip} iconColor={COLORS.primary} label="계정 및 프로필 관리" hasArrow={false} /><View style={styles.rowDivider} /><SettingRow icon="cloud-upload-outline" iconBg={COLORS.chip} iconColor={COLORS.primary} label="녹음 파일 처리 상태 알림" hasArrow={false} /><View style={styles.rowDivider} /><SettingRow icon="calendar-outline" iconBg={COLORS.chip} iconColor={COLORS.primary} label="캘린더 내보내기 관리" hasArrow={false} /></SectionCard>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}><Ionicons name="log-out-outline" size={18} color={COLORS.error} /><Text style={styles.logoutText}>로그아웃</Text></TouchableOpacity><Text style={styles.versionFooter}>Meno v1.0.5</Text>
      </ScrollView>
      <EditProfileModal visible={showEditProfileModal} user={user} onClose={() => setShowEditProfileModal(false)} onSave={handleSaveProfile} />
      <WorkspaceContextModal visible={showWorkspaceContextModal} workspace={workspace} onClose={() => setShowWorkspaceContextModal(false)} onSave={handleSaveWorkspaceContext} saving={isSavingWorkspaceContext} />
    </SafeAreaView>
  );
}
function Stat({ value, label }) { return <View style={styles.statItem}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
function EditProfileModal({ visible, user, onClose, onSave }) {
  const [name, setName] = useState(user?.name || '');

  useEffect(() => {
    if (visible) setName(user?.name || '');
  }, [visible, user?.name]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.profileEditModal} activeOpacity={1}>
          <View style={styles.modalHandle} />
          <Text style={styles.editModalTitle}>프로필 편집</Text>
          <View style={styles.editAvatarPreview}><View style={styles.editAvatarCircle}><Text style={styles.editAvatarText}>{name.charAt(0) || '?'}</Text></View></View>
          <View style={styles.editFieldSection}><Text style={styles.editFieldLabel}>이름</Text><View style={styles.editInputWrap}><Ionicons name="person-outline" size={16} color={COLORS.subtext} /><TextInput style={styles.editInput} placeholder="이름 입력" placeholderTextColor="#A0AEC0" value={name} onChangeText={setName} /></View></View>
          <View style={styles.editModalBtns}><TouchableOpacity style={styles.editCancelBtn} onPress={onClose}><Text style={styles.editCancelText}>취소</Text></TouchableOpacity><TouchableOpacity style={[styles.editConfirmBtn, !name.trim() && styles.editConfirmDisabled]} onPress={() => { if (!name.trim()) return; onSave({ name: name.trim() }); onClose(); }} disabled={!name.trim()}><Text style={styles.editConfirmText}>저장</Text></TouchableOpacity></View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function WorkspaceContextModal({ visible, workspace, onClose, onSave, saving }) {
  const [category, setCategory] = useState(workspace?.meetingCategory || '');
  const [context, setContext] = useState(workspace?.meetingContext || '');

  useEffect(() => {
    if (visible) {
      setCategory(workspace?.meetingCategory || '');
      setContext(workspace?.meetingContext || '');
    }
  }, [visible, workspace?.meetingCategory, workspace?.meetingContext]);

  const handleSave = () => {
    onSave({
      meetingCategory: category.trim() || null,
      meetingContext: context.trim() || null,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={saving ? undefined : onClose}>
        <TouchableOpacity style={styles.profileEditModal} activeOpacity={1}>
          <View style={styles.modalHandle} />
          <Text style={styles.editModalTitle}>회의 문맥 설정</Text>
          <MeetingContextFields
            category={category}
            context={context}
            onChangeCategory={setCategory}
            onChangeContext={setContext}
          />
          <View style={styles.editModalBtns}>
            <TouchableOpacity style={styles.editCancelBtn} onPress={onClose} disabled={saving}><Text style={styles.editCancelText}>취소</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.editConfirmBtn, saving && styles.editConfirmDisabled]} onPress={handleSave} disabled={saving}><Text style={styles.editConfirmText}>{saving ? '저장 중' : '저장'}</Text></TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 40 },
  profileHeader: {
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    paddingTop: 26,
    paddingBottom: 22,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 14,
  },
  profileAvatarWrap: { position: 'relative', marginBottom: 12 },
  profileAvatar: { width: 76, height: 76, borderRadius: 8, backgroundColor: COLORS.chip, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DCE8FF' },
  profileAvatarText: { fontSize: 30, fontWeight: '800', color: COLORS.primary },
  editAvatarBtn: { position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.surface },
  profileName: { fontSize: 20, fontWeight: '800', color: COLORS.text, letterSpacing: 0 },
  profileEmail: { fontSize: 13, color: COLORS.subtext, marginTop: 3 },
  profileRoleBadge: { backgroundColor: COLORS.chip, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 3, marginTop: 8 },
  profileRoleText: { fontSize: 12, color: COLORS.primary, fontWeight: '800' },
  editProfileBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 14, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.chip },
  editProfileText: { fontSize: 13, color: COLORS.primary, fontWeight: '700' },
  statsCard: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 8, marginHorizontal: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: COLORS.border },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  statLabel: { fontSize: 11, color: COLORS.subtext, marginTop: 3, fontWeight: '700' },
  statDivider: { width: 1, height: '80%', backgroundColor: COLORS.border, alignSelf: 'center' },
  sectionCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: COLORS.surface, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: COLORS.subtext, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, textTransform: 'uppercase', letterSpacing: 0 },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  settingIconWrap: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  settingInfo: { flex: 1 },
  settingLabel: { fontSize: 15, color: COLORS.text, fontWeight: '700' },
  settingValue: { fontSize: 12, color: COLORS.subtext, marginTop: 1 },
  rowDivider: { height: 1, backgroundColor: COLORS.border, marginLeft: 62 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 16, marginTop: 6, marginBottom: 16, paddingVertical: 14, borderRadius: 8, backgroundColor: '#FEF2F2', gap: 8, borderWidth: 1, borderColor: '#FECACA' },
  logoutText: { fontSize: 15, color: COLORS.error, fontWeight: '800' },
  versionFooter: { textAlign: 'center', fontSize: 11, color: COLORS.muted, marginBottom: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.42)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  profileEditModal: { backgroundColor: COLORS.surface, borderRadius: 8, padding: 22, width: '100%' },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: 18 },
  editModalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 16 },
  editAvatarPreview: { alignItems: 'center', marginBottom: 20 },
  editAvatarCircle: { width: 64, height: 64, borderRadius: 8, backgroundColor: COLORS.chip, alignItems: 'center', justifyContent: 'center' },
  editAvatarText: { fontSize: 26, fontWeight: '800', color: COLORS.primary },
  editFieldSection: { marginBottom: 14 },
  editFieldLabel: { fontSize: 12, fontWeight: '800', color: COLORS.subtext, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0 },
  editInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.inputBg, borderRadius: 8, paddingHorizontal: 14, height: 48, gap: 10, marginBottom: 6 },
  editInput: { flex: 1, fontSize: 15, color: COLORS.text },
  editModalBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  editCancelBtn: { flex: 1, height: 46, borderRadius: 8, backgroundColor: COLORS.inputBg, alignItems: 'center', justifyContent: 'center' },
  editCancelText: { fontSize: 15, fontWeight: '700', color: COLORS.subtext },
  editConfirmBtn: { flex: 1, height: 46, borderRadius: 8, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  editConfirmDisabled: { opacity: 0.4 },
  editConfirmText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
});
