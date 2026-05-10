import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Screen from '../components/Screen';
import Section from '../components/Section';
import Button from '../components/Button';
import { useAppContext } from '../context/AppContext';
import { colors } from '../theme';

export default function WorkspaceScreen() {
  const { workspace, createWorkspace, inviteMember } = useAppContext();
  const [workspaceName, setWorkspaceName] = useState('프론트엔드 캡스톤 팀');
  const [inviteEmail, setInviteEmail] = useState('');

  if (!workspace) {
    return (
      <Screen>
        <Text style={styles.eyebrow}>STEP 1</Text>
        <Text style={styles.title}>워크스페이스를 만들고 팀원을 초대하세요</Text>
        <Text style={styles.copy}>로그인한 팀 단위로 회의 녹음, 화자 매핑, 캘린더 할일을 관리합니다.</Text>
        <Section title="새 워크스페이스">
          <TextInput value={workspaceName} onChangeText={setWorkspaceName} style={styles.input} />
          <Button title="워크스페이스 생성" onPress={() => createWorkspace(workspaceName)} />
        </Section>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.eyebrow}>WORKSPACE</Text>
          <Text style={styles.title}>{workspace.name}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{workspace.members.length}명</Text>
        </View>
      </View>

      <Section title="멤버">
        {workspace.members.map((member) => (
          <View key={member.id} style={styles.memberRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{member.name.slice(0, 1)}</Text>
            </View>
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{member.name}</Text>
              <Text style={styles.memberEmail}>{member.email}</Text>
            </View>
            <Text style={styles.role}>{member.role}</Text>
          </View>
        ))}
      </Section>

      <Section title="사용자 초대">
        <View style={styles.inviteRow}>
          <TextInput
            value={inviteEmail}
            onChangeText={setInviteEmail}
            placeholder="teammate@company.com"
            autoCapitalize="none"
            style={[styles.input, styles.inviteInput]}
          />
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => {
              inviteMember(inviteEmail);
              setInviteEmail('');
            }}
          >
            <Ionicons name="send" size={19} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        {workspace.invitedEmails.map((email) => (
          <Text key={email} style={styles.invited}>초대 대기 {email}</Text>
        ))}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  copy: {
    color: colors.muted,
    lineHeight: 22,
    marginTop: 10,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  badge: {
    backgroundColor: colors.chip,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  badgeText: {
    color: colors.primary,
    fontWeight: '700',
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 14,
    backgroundColor: '#FBFCFE',
    marginBottom: 12,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    color: colors.text,
    fontWeight: '700',
  },
  memberEmail: {
    color: colors.muted,
    marginTop: 2,
  },
  role: {
    color: colors.mint,
    fontWeight: '700',
  },
  inviteRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inviteInput: {
    flex: 1,
  },
  iconButton: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invited: {
    color: colors.muted,
    marginTop: 6,
  },
});
