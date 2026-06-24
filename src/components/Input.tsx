import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants';

interface InputProps {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onRightIconPress?: () => void;
  [key: string]: any;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  leftIcon,
  rightIcon,
  onRightIconPress,
  ...props
}) => (
  <View style={styles.container}>
    {label && <Text style={styles.label}>{label}</Text>}
    <View style={[styles.inputContainer, error ? styles.inputError : null]}>
      {leftIcon && <View style={styles.icon}>{leftIcon}</View>}
      <TextInput
        style={styles.input}
        placeholderTextColor={COLORS.textLight}
        {...props}
      />
      {rightIcon && (
        <TouchableOpacity onPress={onRightIconPress} disabled={!onRightIconPress} style={styles.icon}>
          {rightIcon}
        </TouchableOpacity>
      )}
    </View>
    {error ? <Text style={styles.errorText}>{error}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.sm,
    height: 48,
  },
  inputError: {
    borderColor: COLORS.warning,
  },
  input: {
    flex: 1,
    height: '100%',
    color: COLORS.text,
    fontSize: TYPOGRAPHY.fontSize.md,
    paddingHorizontal: SPACING.sm,
  },
  icon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.warning,
    fontSize: TYPOGRAPHY.fontSize.sm - 2,
    marginTop: SPACING.xs,
  },
});
