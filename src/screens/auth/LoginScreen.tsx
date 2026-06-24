// src/screens/auth/LoginScreen.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { setCredentials, setError } from '@/store/slices/authSlice';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { COLORS, SPACING, TYPOGRAPHY, MOCK_MODE } from '@/constants';
import { mockApiResponses } from '@/api/mockData';
import Icon from 'react-native-vector-icons/Ionicons';

export const LoginScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const dispatch = useDispatch();
  const authError = useSelector((state: any) => state.auth.error);
  const [email, setEmail] = useState(MOCK_MODE ? 'creator@digisell.app' : '');
  const [password, setPassword] = useState(MOCK_MODE ? 'password123' : '');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({ email: '', password: '' });

  const validate = () => {
    const newErrors = { email: '', password: '' };
    let isValid = true;

    if (!email) {
      newErrors.email = 'Email is required';
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Email is invalid';
      isValid = false;
    }

    if (!password) {
      newErrors.password = 'Password is required';
      isValid = false;
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleLogin = async () => {
    if (!validate()) return;

    dispatch(setError(null));
    setLoading(true);
    try {
      if (MOCK_MODE) {
        const response = await mockApiResponses.login(email, password);
        dispatch(setCredentials(response));
      } else {
        // Real API call would go here
        // const response = await loginMutation({ email, password }).unwrap();
        // dispatch(setCredentials(response));
      }
    } catch (error: any) {
      dispatch(setError(error.message || 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    // Google OAuth implementation would go here
    console.log('Google login');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.logo}>DigiSell</Text>
          <Text style={styles.tagline}>
            Sell digital content. Keep your earnings.
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>

          <Input
            label="Email"
            placeholder="your@email.com"
            value={email}
            onChangeText={setEmail}
            error={errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            leftIcon={<Icon name="mail-outline" size={20} color={COLORS.textLight} />}
          />

          <Input
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            leftIcon={<Icon name="lock-closed-outline" size={20} color={COLORS.textLight} />}
            rightIcon={
              <Icon
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={COLORS.textLight}
              />
            }
            onRightIconPress={() => setShowPassword(!showPassword)}
          />

          {authError ? (
            <View style={styles.errorContainer}>
              <Icon name="alert-circle-outline" size={20} color={COLORS.warning} />
              <Text style={styles.errorText}>{authError}</Text>
            </View>
          ) : null}

          <Button
            title="Sign In"
            onPress={handleLogin}
            loading={loading}
            style={styles.loginButton}
          />

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <Button
            title="Continue with Google"
            onPress={handleGoogleLogin}
            variant="outline"
            icon={<Icon name="logo-google" size={20} color={COLORS.primary} style={{ marginRight: 8 }} />}
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
              <Text style={styles.footerLink}>Sign Up</Text>
            </TouchableOpacity>
          </View>

          {MOCK_MODE && (
            <View style={styles.mockBadge}>
              <Text style={styles.mockText}>🧪 Mock Mode</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },
  logo: {
    fontSize: 36,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.primary,
    marginBottom: SPACING.sm,
  },
  tagline: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.textLight,
    textAlign: 'center',
  },
  form: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  title: {
    fontSize: TYPOGRAPHY.fontSize.xxl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.textLight,
    marginBottom: SPACING.xl,
  },
  loginButton: {
    marginTop: SPACING.sm,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    marginHorizontal: SPACING.md,
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textLight,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.lg,
  },
  footerText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.textLight,
  },
  footerLink: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.primary,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warning + '10',
    padding: SPACING.md,
    borderRadius: 8,
    marginBottom: SPACING.md,
  },
  errorText: {
    color: COLORS.warning,
    fontSize: TYPOGRAPHY.fontSize.sm,
    marginLeft: SPACING.sm,
  },
  mockBadge: {
    marginTop: SPACING.lg,
    padding: SPACING.sm,
    backgroundColor: COLORS.warning + '20',
    borderRadius: 8,
    alignItems: 'center',
  },
  mockText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.warning,
  },
});
