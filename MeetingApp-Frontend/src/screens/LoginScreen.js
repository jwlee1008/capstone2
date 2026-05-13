import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { COLORS } from '../theme';

export default function LoginScreen() {
  const { login, register } = useAppContext();
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    const trimmedName = displayName.trim();
    if (!trimmedEmail || !password) {
      Alert.alert('입력 오류', '이메일과 비밀번호를 입력해주세요.');
      return;
    }
    if (isRegisterMode && !trimmedName) {
      Alert.alert('입력 오류', '회원가입할 이름을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      const payload = { email: trimmedEmail, password, name: trimmedName };
      if (isRegisterMode) {
        await register(payload);
        setIsRegisterMode(false);
        Alert.alert('회원가입 완료', '이제 로그인해주세요.');
      } else {
        await login(payload);
      }
    } catch (error) {
      Alert.alert('요청 실패', error?.message || '다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.headerSection}>
            <View style={styles.logoContainer}>
              <View style={styles.logoCircle}><Ionicons name="mic" size={34} color="#FFFFFF" /></View>
            </View>
            <Text style={styles.appName}>MeetingApp</Text>
            <Text style={styles.tagline}>회의 기록과 일정을 한곳에서 정리하세요</Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>{isRegisterMode ? '회원가입' : '로그인'}</Text>
            {isRegisterMode && (
              <Field label="이름" icon="person-outline" focused={focusedField === 'name'}>
                <TextInput style={styles.input} placeholder="이름 입력" placeholderTextColor="#A0AEC0" value={displayName} onChangeText={setDisplayName} onFocus={() => setFocusedField('name')} onBlur={() => setFocusedField(null)} />
              </Field>
            )}
            <Field label="이메일" icon="mail-outline" focused={focusedField === 'email'}>
              <TextInput style={styles.input} placeholder="이메일 주소 입력" placeholderTextColor="#A0AEC0" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" onFocus={() => setFocusedField('email')} onBlur={() => setFocusedField(null)} />
            </Field>
            <Field label="비밀번호" icon="lock-closed-outline" focused={focusedField === 'password'}>
              <TextInput style={styles.input} placeholder="비밀번호 입력" placeholderTextColor="#A0AEC0" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} onFocus={() => setFocusedField('password')} onBlur={() => setFocusedField(null)} />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}><Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={18} color={COLORS.subtext} /></TouchableOpacity>
            </Field>
            <TouchableOpacity style={[styles.loginButton, isLoading && styles.loginButtonDisabled]} onPress={handleSubmit} activeOpacity={0.85} disabled={isLoading}>
              {isLoading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.loginButtonText}>{isRegisterMode ? '회원가입' : '로그인'}</Text>}
            </TouchableOpacity>
            <Text style={styles.helperText}>이메일로 바로 시작할 수 있습니다.</Text>
          </View>

          <View style={styles.signupRow}>
            <Text style={styles.signupPrompt}>{isRegisterMode ? '이미 계정이 있으신가요? ' : '아직 계정이 없으신가요? '}</Text>
            <TouchableOpacity onPress={() => setIsRegisterMode(!isRegisterMode)}><Text style={styles.signupLink}>{isRegisterMode ? '로그인' : '회원가입'}</Text></TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, icon, focused, children }) {
  return (
    <View style={styles.fieldWrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputContainer, focused && styles.inputFocused]}>
        <Ionicons name={icon} size={18} color={COLORS.subtext} style={styles.inputIcon} />
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 40, justifyContent: 'center' },
  headerSection: { alignItems: 'center', marginBottom: 38 },
  logoContainer: { position: 'relative', marginBottom: 16 },
  logoCircle: { width: 78, height: 78, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 12, elevation: 8 },
  logoBadge: { position: 'absolute', bottom: -4, right: -8, backgroundColor: COLORS.secondary, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 2, borderColor: COLORS.background },
  logoBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700', letterSpacing: 0 },
  appName: { fontSize: 28, fontWeight: '700', color: COLORS.text, letterSpacing: 0 },
  tagline: { fontSize: 14, color: COLORS.subtext, marginTop: 4 },
  formCard: { backgroundColor: COLORS.surface, borderRadius: 18, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 4 },
  formTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginBottom: 20 },
  fieldWrapper: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.inputBg, borderRadius: 12, borderWidth: 1.5, borderColor: 'transparent', paddingHorizontal: 12, height: 50 },
  inputFocused: { borderColor: COLORS.primary, backgroundColor: '#EEF2FF' },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: COLORS.text, height: '100%' },
  eyeIcon: { padding: 4 },
  loginButton: { backgroundColor: COLORS.primary, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.24, shadowRadius: 8, elevation: 6 },
  loginButtonDisabled: { opacity: 0.7 },
  loginButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0 },
  helperText: { textAlign: 'center', color: COLORS.subtext, fontSize: 11, marginTop: 12 },
  signupRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  signupPrompt: { color: COLORS.subtext, fontSize: 14 },
  signupLink: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },
});
