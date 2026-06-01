import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RADIUS, colors, shadow } from '../theme';

export default function Section({ title, action, children, style }) {
  return (
    <View style={[styles.section, style]}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 14,
    ...shadow,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 17,
  },
});
