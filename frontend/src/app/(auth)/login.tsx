import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { ApiClient } from '../../services/api';
import { colors } from '../../theme/colors';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('supervisor@adgarments.com');
  const [password, setPassword] = useState('Password@123');
  const [selectedRole, setSelectedRole] = useState<'SUPERVISOR' | 'MANAGER' | 'ADMIN'>('SUPERVISOR');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [apiUrl, setApiUrl] = useState(ApiClient.getBaseUrl());
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);

  useEffect(() => {
    ApiClient.init().then(() => {
      setApiUrl(ApiClient.getBaseUrl());
      checkServerHealth();
    });
  }, []);

  const checkServerHealth = async () => {
    try {
      await ApiClient.request('/health', { timeoutMs: 2500 });
      setServerOnline(true);
    } catch {
      setServerOnline(false);
    }
  };

  const handleRoleSelect = (role: 'SUPERVISOR' | 'MANAGER' | 'ADMIN') => {
    setSelectedRole(role);
    setError(null);
    if (role === 'SUPERVISOR') {
      setEmail('supervisor@adgarments.com');
      setPassword('Password@123');
    } else if (role === 'MANAGER') {
      setEmail('manager@adgarments.com');
      setPassword('Password@123');
    } else {
      setEmail('admin@adgarments.com');
      setPassword('Password@123');
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please provide both email and password');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials or server connectivity.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveApiUrl = async () => {
    await ApiClient.setBaseUrl(apiUrl.trim());
    setShowConfig(false);
    setError(null);
    checkServerHealth();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Glow Header */}
        <View style={styles.brandHero}>
          <View style={styles.logoRing}>
            <Ionicons name="shield-checkmark" size={34} color="#60A5FA" />
          </View>
          <Text style={styles.brandTitle}>A.D. GARMENTS</Text>
          <View style={styles.badgePill}>
            <Text style={styles.badgePillText}>ATTENDANCE OS &bull; INDUSTRIAL</Text>
          </View>
          <Text style={styles.brandSubtitle}>
            Precision dual-unit workforce attendance & synchronization
          </Text>
        </View>

        {/* Main Glass Card */}
        <View style={styles.authCard}>
          {/* Quick Role Switcher */}
          <Text style={styles.cardHeaderSmall}>SIGN IN AS</Text>
          <View style={styles.roleTabs}>
            {(['SUPERVISOR', 'MANAGER', 'ADMIN'] as const).map((r) => {
              const active = selectedRole === r;
              return (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleTab, active && styles.roleTabActive]}
                  onPress={() => handleRoleSelect(r)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={
                      r === 'SUPERVISOR'
                        ? 'person'
                        : r === 'MANAGER'
                        ? 'briefcase'
                        : 'shield-sharp'
                    }
                    size={14}
                    color={active ? '#ffffff' : colors.textSecondary}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.roleTabText, active && styles.roleTabTextActive]}>
                    {r === 'SUPERVISOR' ? 'Supervisor' : r === 'MANAGER' ? 'Manager' : 'Admin'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color={colors.conflict} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Email Field */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
            <View style={styles.inputBox}>
              <Ionicons name="mail" size={17} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                value={email}
                onChangeText={setEmail}
                placeholder="name@adgarments.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Password Field */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>PASSWORD</Text>
            <View style={styles.inputBox}>
              <Ionicons name="lock-closed" size={17} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
              >
                <Ionicons
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={18}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Primary Action Button */}
          <TouchableOpacity
            style={[styles.loginBtn, isSubmitting && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={isSubmitting}
            activeOpacity={0.85}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Text style={styles.loginBtnText}>Enter Workspace</Text>
                <Ionicons name="arrow-forward" size={18} color="#ffffff" style={{ marginLeft: 8 }} />
              </>
            )}
          </TouchableOpacity>

          {/* Live Status indicator */}
          <View style={styles.connectionStatusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: serverOnline === false ? colors.pendingSync : colors.synced },
              ]}
            />
            <Text style={styles.statusText}>
              {serverOnline === false
                ? 'Backend unreachable &bull; Local SQLite Offline Mode Available'
                : 'Connected to Enterprise REST API'}
            </Text>
          </View>

          {/* Server Config Toggle */}
          <TouchableOpacity
            style={styles.configToggle}
            onPress={() => setShowConfig(!showConfig)}
          >
            <Ionicons name="settings-sharp" size={13} color={colors.textMuted} />
            <Text style={styles.configToggleText}>
              {showConfig ? 'Hide Server Configuration' : 'Advanced: Configure Server URL'}
            </Text>
          </TouchableOpacity>

          {showConfig && (
            <View style={styles.configContainer}>
              <Text style={styles.configLabel}>BACKEND REST API ENDPOINT</Text>
              <TextInput
                style={styles.configInput}
                value={apiUrl}
                onChangeText={setApiUrl}
                placeholder="http://localhost:4000"
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.saveConfigBtn} onPress={handleSaveApiUrl}>
                <Text style={styles.saveConfigBtnText}>Apply Server URL</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Security watermark footer */}
        <View style={styles.footerInfo}>
          <Ionicons name="lock-closed-outline" size={13} color="#64748B" />
          <Text style={styles.footerInfoText}>
            Secured &bull; Concurrency Revision Lock &bull; End-to-End Audit Logs
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    maxWidth: 500,
    width: '100%',
    alignSelf: 'center',
  },
  brandHero: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoRing: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: 1.5,
  },
  badgePill: {
    marginTop: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#93C5FD',
    letterSpacing: 1,
  },
  brandSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 290,
    lineHeight: 18,
  },
  authCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 25,
    elevation: 6,
  },
  cardHeaderSmall: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
  },
  roleTabs: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  roleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 9,
  },
  roleTabActive: {
    backgroundColor: colors.primaryAccent,
    shadowColor: colors.primaryAccent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  roleTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  roleTabTextActive: {
    color: '#ffffff',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    color: colors.conflict,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    height: 48,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  eyeBtn: {
    padding: 8,
  },
  loginBtn: {
    backgroundColor: colors.primaryAccent,
    height: 50,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: colors.primaryAccent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  loginBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  connectionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  configToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    gap: 5,
  },
  configToggleText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
  configContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  configLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textSecondary,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  configInput: {
    height: 40,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    fontSize: 12,
    marginBottom: 8,
    color: colors.text,
  },
  saveConfigBtn: {
    backgroundColor: colors.primaryNavy,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveConfigBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  footerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
    gap: 6,
  },
  footerInfoText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
});
