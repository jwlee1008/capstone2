import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { api } from '../services/api';
import { COLORS } from '../theme';

export default function LoginScreen() {
  const { login, loginWithOAuthCode, register } = useAppContext();
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [oauthProvider, setOauthProvider] = useState(null);
  const [oauthCode, setOauthCode] = useState('');
  const [focusedField, setFocusedField] = useState(null);

  const submitOAuthCode = async (provider = oauthProvider, code = oauthCode) => {
    if (!provider || !code.trim()) return Alert.alert('인증 코드 필요', 'OAuth 인증 후 받은 code를 입력해주세요.');
    setIsLoading(true);
    try {
      await loginWithOAuthCode(provider, code.trim());
      setOauthProvider(null);
      setOauthCode('');
    } catch (error) {
      Alert.alert('소셜 로그인 실패', error?.message || '인증 코드를 처리하지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const tryConsumeUrl = async (url) => {
      const parsed = parseOAuthUrl(url);
      if (!parsed?.code || !parsed.provider) return;
      setOauthProvider(parsed.provider);
      setOauthCode(parsed.code);
      await submitOAuthCode(parsed.provider, parsed.code);
    };
    Linking.getInitialURL().then((url) => url && tryConsumeUrl(url)).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => tryConsumeUrl(url));
    return () => subscription?.remove?.();
  }, []);

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

  const startSocialLogin = async (provider) => {
    setIsLoading(true);
    try {
      const data = provider === 'google' ? await api.getGoogleAuthUrl() : await api.getNotionAuthUrl();
      const authUrl = data?.authUrl || data?.url || data;
      if (!authUrl) throw new Error('OAuth 인증 URL을 받지 못했습니다.');
      setOauthProvider(provider);
      setOauthCode('');
      await Linking.openURL(authUrl);
    } catch (error) {
      Alert.alert('소셜 로그인 실패', error?.message || '인증 URL을 열지 못했습니다.');
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
              <View style={styles.logoBadge}><Text style={styles.logoBadgeText}>PRO</Text></View>
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
            {!isRegisterMode ? (
              <>
                <View style={styles.socialDivider}><View style={styles.dividerLine} /><Text style={styles.dividerText}>또는</Text><View style={styles.dividerLine} /></View>
                <View style={styles.socialRow}>
                  <TouchableOpacity style={styles.socialButton} onPress={() => startSocialLogin('google')} activeOpacity={0.85} disabled={isLoading}>
                    <Ionicons name="logo-google" size={17} color={COLORS.text} />
                    <Text style={styles.socialText}>Google</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.socialButton} onPress={() => startSocialLogin('notion')} activeOpacity={0.85} disabled={isLoading}>
                    <Ionicons name="document-text-outline" size={17} color={COLORS.text} />
                    <Text style={styles.socialText}>Notion</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
            <Text style={styles.helperText}>이메일로 바로 시작할 수 있습니다.</Text>
          </View>

          <View style={styles.signupRow}>
            <Text style={styles.signupPrompt}>{isRegisterMode ? '이미 계정이 있으신가요? ' : '아직 계정이 없으신가요? '}</Text>
            <TouchableOpacity onPress={() => setIsRegisterMode(!isRegisterMode)}><Text style={styles.signupLink}>{isRegisterMode ? '로그인' : '회원가입'}</Text></TouchableOpacity>
          </View>
        </ScrollView>
        <OAuthCodeModal visible={Boolean(oauthProvider)} provider={oauthProvider} value={oauthCode} onChange={setOauthCode} onClose={() => setOauthProvider(null)} onSubmit={() => submitOAuthCode()} isLoading={isLoading} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function parseOAuthUrl(url) {
  try {
    const parsed = new URL(url);
    const code = parsed.searchParams.get('code');
    const provider = parsed.pathname.includes('notion') ? 'notion' : parsed.pathname.includes('google') ? 'google' : null;
    return { provider, code };
  } catch {
    return null;
  }
}

function OAuthCodeModal({ visible, provider, value, onChange, onClose, onSubmit, isLoading }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.oauthModal}>
          <Text style={styles.oauthTitle}>{provider === 'notion' ? 'Notion' : 'Google'} 로그인</Text>
          <Text style={styles.oauthDesc}>브라우저 인증 후 앱으로 돌아오지 않으면 callback URL의 code 값을 붙여넣어 주세요.</Text>
          <TextInput style={styles.oauthInput} placeholder="OAuth code" placeholderTextColor="#A0AEC0" value={value} onChangeText={onChange} autoCapitalize="none" />
          <View style={styles.oauthActions}>
            <TouchableOpacity style={styles.oauthCancelBtn} onPress={onClose}><Text style={styles.oauthCancelText}>취소</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.oauthConfirmBtn, (!value.trim() || isLoading) && styles.loginButtonDisabled]} onPress={onSubmit} disabled={!value.trim() || isLoading}>
              <Text style={styles.oauthConfirmText}>{isLoading ? '처리 중' : '완료'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
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
  socialDivider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, marginBottom: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { color: COLORS.subtext, fontSize: 11, fontWeight: '700' },
  socialRow: { flexDirection: 'row', gap: 8 },
  socialButton: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  socialText: { fontSize: 13, color: COLORS.text, fontWeight: '700' },
  helperText: { textAlign: 'center', color: COLORS.subtext, fontSize: 11, marginTop: 12 },
  signupRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  signupPrompt: { color: COLORS.subtext, fontSize: 14 },
  signupLink: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  oauthModal: { width: '100%', backgroundColor: COLORS.surface, borderRadius: 18, padding: 22 },
  oauthTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  oauthDesc: { fontSize: 12, color: COLORS.subtext, lineHeight: 18, marginBottom: 14 },
  oauthInput: { height: 46, borderRadius: 12, backgroundColor: COLORS.inputBg, paddingHorizontal: 12, color: COLORS.text, marginBottom: 12 },
  oauthActions: { flexDirection: 'row', gap: 8 },
  oauthCancelBtn: { flex: 1, height: 44, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  oauthCancelText: { color: COLORS.subtext, fontWeight: '700' },
  oauthConfirmBtn: { flex: 1, height: 44, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  oauthConfirmText: { color: '#FFFFFF', fontWeight: '800' },
});
