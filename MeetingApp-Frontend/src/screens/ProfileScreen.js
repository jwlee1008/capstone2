import React, { useState } from 'react';
import { Alert, Image, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useAppContext } from '../context/AppContext';
import { COLORS } from '../theme';

function SettingRow({ icon, iconBg, iconColor, label, value, onPress, hasArrow = true, danger = false }) {
  return (
    <TouchableOpacity style={styles.settingRow} onPress={onPress} activeOpacity={0.7} disabled={!onPress}>
      <View style={[styles.settingIconWrap, { backgroundColor: iconBg || '#F1F5F9' }]}>
        <Ionicons name={icon} size={18} color={iconColor || COLORS.subtext} />
      </View>
      <View style={styles.settingInfo}>
        <Text style={[styles.settingLabel, danger && styles.dangerText]}>{label}</Text>
        {value ? <Text style={styles.settingValue}>{value}</Text> : null}
      </View>
      {hasArrow && <Ionicons name="chevron-forward" size={16} color={COLORS.border} />}
    </TouchableOpacity>
  );
}

function SectionCard({ title, children }) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View>{children}</View>
    </View>
  );
}

export default function MyInfoScreen() {
  const {
    user,
    workspace,
    meetings,
    calendarTasks,
    logout,
    updateUser,
    updateProfileImageFromAsset,
    changePassword,
    deleteAccount,
  } = useAppContext();
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const totalSessions = meetings.reduce((acc, meeting) => acc + meeting.sessions.length, 0);

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('정말 로그아웃 하시겠어요?')) logout();
      return;
    }
    Alert.alert('로그아웃', '정말 로그아웃 하시겠어요?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: logout },
    ]);
  };

  const handleSaveProfile = async (updates) => {
    try {
      await updateUser(updates);
      Alert.alert('저장 완료', '프로필이 업데이트되었습니다.');
    } catch (error) {
      Alert.alert('저장 실패', error?.message || '프로필을 업데이트하지 못했습니다.');
    }
  };

  const handlePickProfileImage = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      setIsUploadingImage(true);
      await updateProfileImageFromAsset(result.assets?.[0]);
      Alert.alert('업로드 완료', '프로필 이미지가 변경되었습니다.');
    } catch (error) {
      Alert.alert('업로드 실패', error?.message || '프로필 이미지를 변경하지 못했습니다.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleChangePassword = async (payload) => {
    try {
      await changePassword(payload);
      Alert.alert('변경 완료', '비밀번호가 변경되었습니다.');
      setShowPasswordModal(false);
    } catch (error) {
      Alert.alert('변경 실패', error?.message || '비밀번호를 변경하지 못했습니다.');
    }
  };

  const runDeleteAccount = async () => {
    try {
      await deleteAccount();
      Alert.alert('탈퇴 완료', '계정이 삭제되었습니다.');
    } catch (error) {
      Alert.alert('탈퇴 실패', error?.message || '계정을 삭제하지 못했습니다.');
    }
  };

  const handleDeleteAccount = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('정말 회원 탈퇴를 진행할까요? 이 작업은 되돌릴 수 없습니다.')) runDeleteAccount();
      return;
    }
    Alert.alert('회원 탈퇴', '정말 회원 탈퇴를 진행할까요? 이 작업은 되돌릴 수 없습니다.', [
      { text: '취소', style: 'cancel' },
      { text: '탈퇴', style: 'destructive', onPress: runDeleteAccount },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.profileHeader}>
          <View style={styles.profileAvatarWrap}>
            <View style={styles.profileAvatar}>
              {user?.profileImg ? (
                <Image source={{ uri: user.profileImg }} style={styles.profileImage} />
              ) : (
                <Text style={styles.profileAvatarText}>{user?.name?.charAt(0) || 'U'}</Text>
              )}
            </View>
            <TouchableOpacity style={styles.editAvatarBtn} onPress={handlePickProfileImage} disabled={isUploadingImage}>
              <Ionicons name={isUploadingImage ? 'hourglass-outline' : 'camera'} size={14} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <Text style={styles.profileName}>{user?.name || '사용자'}</Text>
          <Text style={styles.profileEmail}>{user?.email || 'user@meetingapp.io'}</Text>
          <View style={styles.profileRoleBadge}><Text style={styles.profileRoleText}>{user?.role || '서비스 운영'}</Text></View>
          <TouchableOpacity style={styles.editProfileBtn} activeOpacity={0.85} onPress={() => setShowEditProfileModal(true)}>
            <Ionicons name="pencil-outline" size={14} color={COLORS.primary} />
            <Text style={styles.editProfileText}>프로필 편집</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsCard}>
          <Stat value={meetings.length} label="전체 회의" />
          <View style={styles.statDivider} />
          <Stat value={totalSessions} label="총 세션" />
          <View style={styles.statDivider} />
          <Stat value={calendarTasks.length} label="할일" />
        </View>

        <SectionCard title="워크스페이스">
          <SettingRow icon="business-outline" iconBg="#EEF2FF" iconColor={COLORS.primary} label="현재 워크스페이스" value={workspace?.name || '생성 전'} hasArrow={false} />
          <View style={styles.rowDivider} />
          <SettingRow icon="people-outline" iconBg="#F0FDF4" iconColor={COLORS.success} label="멤버 수" value={`${workspace?.members?.length || 0}명`} hasArrow={false} />
        </SectionCard>

        <SectionCard title="계정 관리">
          <SettingRow icon="image-outline" iconBg="#EEF2FF" iconColor={COLORS.primary} label="프로필 이미지 변경" value={isUploadingImage ? '업로드 중' : 'S3 업로드'} onPress={handlePickProfileImage} />
          <View style={styles.rowDivider} />
          <SettingRow icon="key-outline" iconBg="#EEF2FF" iconColor={COLORS.primary} label="비밀번호 변경" onPress={() => setShowPasswordModal(true)} />
          <View style={styles.rowDivider} />
          <SettingRow icon="trash-outline" iconBg="#FEF2F2" iconColor={COLORS.error} label="회원 탈퇴" onPress={handleDeleteAccount} danger />
        </SectionCard>

        <SectionCard title="서비스 설정">
          <SettingRow icon="cloud-upload-outline" iconBg="#EEF2FF" iconColor={COLORS.primary} label="녹음 파일 처리 상태 알림" hasArrow={false} />
          <View style={styles.rowDivider} />
          <SettingRow icon="calendar-outline" iconBg="#EEF2FF" iconColor={COLORS.primary} label="캘린더 내보내기 관리" hasArrow={false} />
        </SectionCard>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
          <Ionicons name="log-out-outline" size={18} color={COLORS.error} />
          <Text style={styles.logoutText}>로그아웃</Text>
        </TouchableOpacity>
        <Text style={styles.versionFooter}>MeetingApp v1.0.0</Text>
      </ScrollView>

      <EditProfileModal visible={showEditProfileModal} user={user} onClose={() => setShowEditProfileModal(false)} onSave={handleSaveProfile} />
      <PasswordModal visible={showPasswordModal} onClose={() => setShowPasswordModal(false)} onSave={handleChangePassword} />
    </SafeAreaView>
  );
}

function Stat({ value, label }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function EditProfileModal({ visible, user, onClose, onSave }) {
  const [name, setName] = useState(user?.name || '');
  const [role, setRole] = useState(user?.role || '');
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.profileEditModal} activeOpacity={1}>
          <View style={styles.modalHandle} />
          <Text style={styles.editModalTitle}>프로필 편집</Text>
          <View style={styles.editAvatarPreview}>
            <View style={styles.editAvatarCircle}><Text style={styles.editAvatarText}>{name.charAt(0) || '?'}</Text></View>
          </View>
          <View style={styles.editFieldSection}>
            <Text style={styles.editFieldLabel}>이름</Text>
            <View style={styles.editInputWrap}>
              <Ionicons name="person-outline" size={16} color={COLORS.subtext} />
              <TextInput style={styles.editInput} placeholder="이름 입력" placeholderTextColor="#A0AEC0" value={name} onChangeText={setName} />
            </View>
          </View>
          <View style={styles.editFieldSection}>
            <Text style={styles.editFieldLabel}>소속 / 역할</Text>
            <View style={styles.editInputWrap}>
              <Ionicons name="briefcase-outline" size={16} color={COLORS.subtext} />
              <TextInput style={styles.editInput} placeholder="예: 서비스 운영, PM" placeholderTextColor="#A0AEC0" value={role} onChangeText={setRole} />
            </View>
          </View>
          <View style={styles.editModalBtns}>
            <TouchableOpacity style={styles.editCancelBtn} onPress={onClose}><Text style={styles.editCancelText}>취소</Text></TouchableOpacity>
            <TouchableOpacity
              style={[styles.editConfirmBtn, !name.trim() && styles.editConfirmDisabled]}
              onPress={() => { if (!name.trim()) return; onSave({ name: name.trim(), role: role.trim() }); onClose(); }}
              disabled={!name.trim()}
            >
              <Text style={styles.editConfirmText}>저장</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function PasswordModal({ visible, onClose, onSave }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSave = () => {
    if (!currentPassword || !newPassword) return Alert.alert('입력 오류', '현재 비밀번호와 새 비밀번호를 입력해주세요.');
    if (newPassword.length < 8) return Alert.alert('입력 오류', '새 비밀번호는 8자 이상이어야 합니다.');
    if (newPassword !== confirmPassword) return Alert.alert('입력 오류', '새 비밀번호 확인이 일치하지 않습니다.');
    onSave({ currentPassword, newPassword });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.profileEditModal} activeOpacity={1}>
          <View style={styles.modalHandle} />
          <Text style={styles.editModalTitle}>비밀번호 변경</Text>
          <PasswordField label="현재 비밀번호" value={currentPassword} onChangeText={setCurrentPassword} />
          <PasswordField label="새 비밀번호" value={newPassword} onChangeText={setNewPassword} />
          <PasswordField label="새 비밀번호 확인" value={confirmPassword} onChangeText={setConfirmPassword} />
          <View style={styles.editModalBtns}>
            <TouchableOpacity style={styles.editCancelBtn} onPress={onClose}><Text style={styles.editCancelText}>취소</Text></TouchableOpacity>
            <TouchableOpacity style={styles.editConfirmBtn} onPress={handleSave}><Text style={styles.editConfirmText}>변경</Text></TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function PasswordField({ label, value, onChangeText }) {
  return (
    <View style={styles.editFieldSection}>
      <Text style={styles.editFieldLabel}>{label}</Text>
      <View style={styles.editInputWrap}>
        <Ionicons name="lock-closed-outline" size={16} color={COLORS.subtext} />
        <TextInput style={styles.editInput} secureTextEntry placeholder={label} placeholderTextColor="#A0AEC0" value={value} onChangeText={onChangeText} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 40 },
  profileHeader: { backgroundColor: COLORS.surface, alignItems: 'center', paddingTop: 28, paddingBottom: 24, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: 16 },
  profileAvatarWrap: { position: 'relative', marginBottom: 12 },
  profileAvatar: { width: 80, height: 80, borderRadius: 24, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 4 },
  profileImage: { width: '100%', height: '100%' },
  profileAvatarText: { fontSize: 32, fontWeight: '700', color: COLORS.primary },
  editAvatarBtn: { position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.surface },
  profileName: { fontSize: 20, fontWeight: '700', color: COLORS.text, letterSpacing: 0 },
  profileEmail: { fontSize: 13, color: COLORS.subtext, marginTop: 3 },
  profileRoleBadge: { backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, marginTop: 8 },
  profileRoleText: { fontSize: 12, color: COLORS.primary, fontWeight: '700' },
  editProfileBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 14, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: '#EEF2FF' },
  editProfileText: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  statsCard: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 16, marginHorizontal: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700', color: COLORS.text },
  statLabel: { fontSize: 11, color: COLORS.subtext, marginTop: 3 },
  statDivider: { width: 1, height: '80%', backgroundColor: COLORS.border, alignSelf: 'center' },
  sectionCard: { marginHorizontal: 16, marginBottom: 14, backgroundColor: COLORS.surface, borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, overflow: 'hidden' },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: COLORS.subtext, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, textTransform: 'uppercase', letterSpacing: 0 },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  settingIconWrap: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  settingInfo: { flex: 1 },
  settingLabel: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  settingValue: { fontSize: 12, color: COLORS.subtext, marginTop: 1 },
  dangerText: { color: COLORS.error },
  rowDivider: { height: 1, backgroundColor: COLORS.border, marginLeft: 62 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 16, marginTop: 6, marginBottom: 16, paddingVertical: 14, borderRadius: 14, backgroundColor: '#FEF2F2', gap: 8, borderWidth: 1, borderColor: '#FECACA' },
  logoutText: { fontSize: 15, color: COLORS.error, fontWeight: '700' },
  versionFooter: { textAlign: 'center', fontSize: 11, color: '#A0AEC0', marginBottom: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  profileEditModal: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 24, width: '100%' },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: 20 },
  editModalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 16 },
  editAvatarPreview: { alignItems: 'center', marginBottom: 20 },
  editAvatarCircle: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  editAvatarText: { fontSize: 26, fontWeight: '700', color: COLORS.primary },
  editFieldSection: { marginBottom: 14 },
  editFieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.subtext, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0 },
  editInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 14, height: 48, gap: 10, marginBottom: 6 },
  editInput: { flex: 1, fontSize: 15, color: COLORS.text },
  editModalBtns: { flexDirection: 'row', gap: 10 },
  editCancelBtn: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  editCancelText: { fontSize: 15, fontWeight: '600', color: COLORS.subtext },
  editConfirmBtn: { flex: 1, height: 46, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  editConfirmDisabled: { opacity: 0.4 },
  editConfirmText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
