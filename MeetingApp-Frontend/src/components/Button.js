import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors } from '../theme';

export default function Button({ title, onPress, variant = 'primary', icon, loading, disabled, style }) {
  const isGhost = variant === 'ghost';
  const isLight = variant === 'light';

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        isGhost && styles.ghost,
        isLight && styles.light,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={isGhost ? colors.primary : '#FFFFFF'} /> : icon}
      <Text style={[styles.text, (isGhost || isLight) && styles.darkText]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.line,
  },
  light: {
    backgroundColor: colors.chip,
  },
  disabled: {
    opacity: 0.6,
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  darkText: {
    color: colors.primary,
  },
});
