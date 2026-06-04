import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { COLORS } from '../theme';

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default function AddMeetingScreen({ navigation }) {
  const { workspace, addMeeting, inviteMember } = useAppContext();
  const [meetingName, setMeetingName] = useState('');
  const [inviteInput, setInviteInput] = useState('');
  const [inviteEmails, setInviteEmails] = useState([]);
  const [focusedField, setFocusedField] = useState(null);
  const [isCreating, setIsCreating] = useState(false);

  const addInviteEmail = () => {
    const email = inviteInput.trim().toLowerCase();
    if (!email) return;
    if (!isEmail(email)) return Alert.alert('입력 오류', '회원가입 ID로 사용한 이메일을 입력해주세요.');
    if (inviteEmails.includes(email)) return Alert.alert('중복', '이미 추가된 이메일입니다.');
    setInviteEmails((prev) => [...prev, email]);
    setInviteInput('');
  };

  const create = async () => {
    if (!workspace?.id) return Alert.alert('워크스페이스 선택', '회의를 만들 워크스페이스를 먼저 선택해주세요.');
    if (!meetingName.trim()) return Alert.alert('입력 오류', '회의 이름을 입력해주세요.');

    try {
      setIsCreating(true);
      const meeting = await addMeeting({
        name: meetingName.trim(),
        participants: inviteEmails,
      });

      if (inviteEmails.length > 0) {
        const results = await Promise.allSettled(inviteEmails.map((email) => inviteMember(email)));
        const failedCount = results.filter((result) => result.status === 'rejected').length;
        if (failedCount > 0) {
          Alert.alert('회의 생성 완료', `${inviteEmails.length - failedCount}명에게 워크스페이스 초대를 보냈고, ${failedCount}명 초대는 실패했습니다.`);
        } else {
          Alert.alert('회의 생성 완료', '워크스페이스 초대 이메일을 보냈습니다.');
        }
      }

      navigation.replace('MeetingDetail', { meetingId: meeting.id, meetingName: meeting.name });
    } catch (error) {
      Alert.alert('회의 생성 실패', error?.message || '회의를 만들지 못했습니다.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.workspaceNotice}>
            <View style={styles.workspaceNoticeIcon}><Ionicons name="business-outline" size={18} color={COLORS.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.workspaceNoticeLabel}>생성 위치</Text>
              <Text style={styles.workspaceNoticeName}>{workspace?.name || '워크스페이스를 먼저 선택해주세요'}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>회의 이름 <Text style={styles.required}>*</Text></Text>
            <View style={[styles.inputWrap, focusedField === 'name' && styles.inputFocused]}>
              <Ionicons name="mic-outline" size={18} color={COLORS.subtext} style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="예: 주간 스탠드업" placeholderTextColor={COLORS.subtext} value={meetingName} onChangeText={setMeetingName} maxLength={50} onFocus={() => setFocusedField('name')} onBlur={() => setFocusedField(null)} />
              <Text style={styles.charCount}>{meetingName.length}/50</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>워크스페이스 초대 이메일 <Text style={styles.optional}>(선택)</Text></Text>
            <View style={styles.participantInputRow}>
              <View style={[styles.inputWrap, styles.participantInputWrap, focusedField === 'invite' && styles.inputFocused]}>
                <Ionicons name="mail-outline" size={18} color={COLORS.subtext} style={styles.inputIcon} />
                <TextInput style={styles.input} placeholder="가입한 이메일 입력 후 추가" placeholderTextColor={COLORS.subtext} value={inviteInput} onChangeText={setInviteInput} onSubmitEditing={addInviteEmail} autoCapitalize="none" keyboardType="email-address" onFocus={() => setFocusedField('invite')} onBlur={() => setFocusedField(null)} />
              </View>
              <TouchableOpacity style={[styles.addParticipantBtn, !inviteInput.trim() && styles.addBtnDisabled]} onPress={addInviteEmail} disabled={!inviteInput.trim()}>
                <Ionicons name="add" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.helperText}>초대받은 사용자가 로그인 후 수락하면 이 워크스페이스의 회의 목록을 볼 수 있습니다.</Text>
            <View style={styles.participantTags}>
              {inviteEmails.map((email) => (
                <View key={email} style={styles.participantTag}>
                  <View style={styles.participantAvatar}><Text style={styles.participantAvatarText}>{email.charAt(0).toUpperCase()}</Text></View>
                  <Text style={styles.participantTagText}>{email}</Text>
                  <TouchableOpacity onPress={() => setInviteEmails((prev) => prev.filter((item) => item !== email))} style={styles.participantRemoveBtn}>
                    <Ionicons name="close" size={13} color={COLORS.subtext} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>

          <TouchableOpacity style={[styles.createBtn, (!workspace?.id || !meetingName.trim() || isCreating) && styles.createBtnDisabled]} onPress={create} disabled={!workspace?.id || !meetingName.trim() || isCreating} activeOpacity={0.88}>
            <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.createBtnText}>{isCreating ? '회의 만드는 중' : '회의 만들기'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  workspaceNotice: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderRadius: 8, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: COLORS.border },
  workspaceNoticeIcon: { width: 38, height: 38, borderRadius: 8, backgroundColor: COLORS.chip, alignItems: 'center', justifyContent: 'center' },
  workspaceNoticeLabel: { fontSize: 11, fontWeight: '800', color: COLORS.primary, marginBottom: 2 },
  workspaceNoticeName: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  section: { marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  required: { color: COLORS.error },
  optional: { color: COLORS.subtext, fontWeight: '400', fontSize: 12 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 12, height: 50 },
  inputFocused: { borderColor: COLORS.primary, backgroundColor: COLORS.chip },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: COLORS.text },
  charCount: { fontSize: 11, color: COLORS.subtext },
  helperText: { fontSize: 12, color: COLORS.subtext, lineHeight: 18, marginTop: 8 },
  participantInputRow: { flexDirection: 'row', gap: 8 },
  participantInputWrap: { flex: 1 },
  addParticipantBtn: { width: 50, height: 50, borderRadius: 8, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  addBtnDisabled: { opacity: 0.4 },
  participantTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  participantTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 8, paddingVertical: 5, paddingLeft: 6, paddingRight: 8, borderWidth: 1, borderColor: COLORS.border, gap: 6 },
  participantAvatar: { width: 24, height: 24, borderRadius: 7, backgroundColor: COLORS.chip, alignItems: 'center', justifyContent: 'center' },
  participantAvatarText: { fontSize: 11, fontWeight: '800', color: COLORS.primary },
  participantTagText: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  participantRemoveBtn: { width: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.inputBg, alignItems: 'center', justifyContent: 'center' },
  textareaWrap: { height: 100, alignItems: 'flex-start', paddingTop: 12 },
  textarea: { height: 80 },
  charCountRight: { textAlign: 'right', fontSize: 11, color: COLORS.subtext, marginTop: 4 },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary, borderRadius: 8, height: 54, marginTop: 8 },
  createBtnDisabled: { opacity: 0.5, shadowOpacity: 0 },
  createBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0 },
});
