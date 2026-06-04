import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../theme';

export const MEETING_CATEGORIES = [
  '개발',
  '기획',
  '디자인',
  '마케팅',
  '영업',
  '교육',
  '의료',
  '법률',
  '패션/의류',
  '금융',
  '인사/채용',
  '기타',
];

export default function MeetingContextFields({
  category,
  context,
  onChangeCategory,
  onChangeContext,
  compact = false,
}) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Text style={styles.label}>회의 카테고리</Text>
      <View style={styles.categoryGrid}>
        {MEETING_CATEGORIES.map((item) => {
          const active = String(category || '') === item;
          return (
            <TouchableOpacity
              key={item}
              style={[styles.categoryChip, active && styles.categoryChipActive]}
              onPress={() => onChangeCategory(active ? '' : item)}
              activeOpacity={0.82}
            >
              <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{item}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.label, styles.contextLabel]}>추가 문맥</Text>
      <TextInput
        value={context}
        onChangeText={onChangeContext}
        style={[styles.contextInput, compact && styles.contextInputCompact]}
        placeholder="예: React Native, Spring Boot, Notion API"
        placeholderTextColor={COLORS.muted}
        multiline
        maxLength={1000}
        textAlignVertical="top"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  wrapCompact: { marginTop: 2 },
  label: { fontSize: 12, fontWeight: '800', color: COLORS.subtext, letterSpacing: 0 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  categoryChip: {
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  categoryChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.chip },
  categoryText: { fontSize: 12, fontWeight: '800', color: COLORS.subtext },
  categoryTextActive: { color: COLORS.primary },
  contextLabel: { marginTop: 4 },
  contextInput: {
    minHeight: 86,
    borderRadius: 8,
    backgroundColor: COLORS.inputBg,
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  contextInputCompact: { minHeight: 74 },
});
