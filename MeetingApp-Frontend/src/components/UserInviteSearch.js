import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';
import { useAppContext } from '../context/AppContext';

export default function UserInviteSearch({
  title,
  description,
  invitedEmails = [],
  onInvite,
  placeholder = '이름 또는 이메일 검색',
}) {
  const { searchUsers } = useAppContext();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isInviting, setIsInviting] = useState(false);

  useEffect(() => {
    const keyword = query.trim();
    if (selectedUser && (keyword === selectedUser.email || keyword === selectedUser.name)) return;
    if (keyword.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        setResults(await searchUsers(keyword));
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, selectedUser, searchUsers]);

  const handleChangeText = (value) => {
    setQuery(value);
    setSelectedUser(null);
  };

  const handleSelect = (user) => {
    setSelectedUser(user);
    setQuery(user.email || user.name || '');
    setResults([]);
  };

  const handleInvite = async () => {
    if (!selectedUser?.email) {
      Alert.alert('사용자 선택', '검색 결과에서 초대할 사용자를 선택해주세요.');
      return;
    }

    try {
      setIsInviting(true);
      await onInvite(selectedUser.email);
      Alert.alert('초대 완료', `${selectedUser.email} 주소로 초대를 보냈습니다.`);
      setQuery('');
      setSelectedUser(null);
      setResults([]);
    } catch (error) {
      Alert.alert('초대 실패', error?.message || '초대를 보내지 못했습니다.');
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <View style={styles.container}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {description ? <Text style={styles.description}>{description}</Text> : null}
      <View style={styles.searchRow}>
        <View style={styles.inputWrap}>
          <Ionicons name="search-outline" size={16} color={COLORS.subtext} />
          <TextInput
            value={query}
            onChangeText={handleChangeText}
            placeholder={placeholder}
            placeholderTextColor="#A0AEC0"
            autoCapitalize="none"
            style={styles.input}
          />
          {isSearching ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
        </View>
        <TouchableOpacity
          style={[styles.inviteButton, (!selectedUser || isInviting) && styles.inviteButtonDisabled]}
          onPress={handleInvite}
          disabled={!selectedUser || isInviting}
        >
          {isInviting ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="send" size={18} color="#FFFFFF" />}
        </TouchableOpacity>
      </View>

      {results.length > 0 ? (
        <View style={styles.results}>
          {results.map((user) => (
            <TouchableOpacity key={user.email || user.id} style={styles.resultRow} onPress={() => handleSelect(user)}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{(user.name || user.email || '?').charAt(0)}</Text></View>
              <View style={styles.resultInfo}>
                <Text style={styles.resultName}>{user.name || '이름 없음'}</Text>
                <Text style={styles.resultEmail}>{user.email}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {query.trim().length >= 2 && !isSearching && results.length === 0 && !selectedUser ? (
        <Text style={styles.hintText}>검색 결과가 없으면 이메일 또는 이름을 다시 확인해주세요.</Text>
      ) : null}

      {selectedUser ? <Text style={styles.selectedText}>선택됨: {selectedUser.name || selectedUser.email}</Text> : null}
      {invitedEmails.map((email) => <Text key={email} style={styles.invitedText}>초대 대기: {email}</Text>)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  title: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  description: { fontSize: 12, color: COLORS.subtext, lineHeight: 18 },
  searchRow: { flexDirection: 'row', gap: 8 },
  inputWrap: { flex: 1, height: 48, borderRadius: 12, backgroundColor: COLORS.inputBg, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  input: { flex: 1, color: COLORS.text, fontSize: 14 },
  inviteButton: { width: 48, height: 48, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  inviteButtonDisabled: { opacity: 0.45 },
  results: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.surface, overflow: 'hidden' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  avatar: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: COLORS.primary, fontWeight: '700' },
  resultInfo: { flex: 1 },
  resultName: { color: COLORS.text, fontWeight: '700', fontSize: 13 },
  resultEmail: { color: COLORS.subtext, fontSize: 12, marginTop: 1 },
  hintText: { color: COLORS.subtext, fontSize: 12 },
  selectedText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  invitedText: { color: COLORS.subtext, fontSize: 12 },
});
