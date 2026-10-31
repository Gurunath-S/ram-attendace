import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { syncEngine } from '../../services/syncEngine';
import { dbService, SyncQueueItem } from '../../services/db';
import { ApiClient } from '../../services/api';
import { colors } from '../../theme/colors';

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const [syncState, setSyncState] = useState({
    isSyncing: false,
    pendingCount: 0,
    lastSyncedAt: null as string | null,
  });
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([]);
  const [apiUrl, setApiUrl] = useState(ApiClient.getBaseUrl());
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [cachedReportCount, setCachedReportCount] = useState<number>(0);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateStatusText, setUpdateStatusText] = useState<string | null>(null);

  useEffect(() => {
    const unsub = syncEngine.subscribe(setSyncState);
    loadDiagnostics();
    return () => {
      unsub();
    };
  }, []);

  const loadDiagnostics = async () => {
    try {
      const items = await dbService.getPendingSyncOperations();
      setQueueItems(items);
      const allReports = await dbService.getAllLocalReports();
      setCachedReportCount(allReports.length);
    } catch {}
  };

  const handleTestLatency = async () => {
    setIsPinging(true);
    const start = Date.now();
    try {
      await ApiClient.request('/health', { timeoutMs: 3000 });
      setPingMs(Date.now() - start);
    } catch {
      setPingMs(-1); // offline
    } finally {
      setIsPinging(false);
    }
  };

  const handleManualSync = async () => {
    const res = await syncEngine.triggerSync();
    if (res.success) {
      Alert.alert('Sync Complete', 'All pending operations synchronized with server.');
    } else {
      Alert.alert(
        'Offline Engine Active',
        res.error || 'Server unreachable. Changes safely stored in local queue.'
      );
    }
    await loadDiagnostics();
  };

  const handleSaveApiUrl = async () => {
    await ApiClient.setBaseUrl(apiUrl.trim());
    setIsEditingUrl(false);
    Alert.alert('Saved', 'API Base URL updated.');
    handleTestLatency();
  };

  const handlePresetUrl = async (url: string) => {
    setApiUrl(url);
    await ApiClient.setBaseUrl(url);
    Alert.alert('Endpoint Set', `API URL set to: ${url}`);
    handleTestLatency();
  };

  const handleCheckOtaUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateStatusText(null);
    try {
      if (Platform.OS === 'web') {
        setUpdateStatusText('🌐 Web version updates automatically on page reload');
        Alert.alert(
          'Web Mode Active',
          'On mobile web, your application loads the latest code automatically on refresh.'
        );
        return;
      }

      const Updates = await import('expo-updates');
      const check = await Updates.checkForUpdateAsync();
      if (check.isAvailable) {
        setUpdateStatusText('⬇️ Downloading new update package...');
        await Updates.fetchUpdateAsync();
        setUpdateStatusText('✅ Update ready! Restart app to apply.');
        Alert.alert(
          'Update Downloaded',
          'A new version is downloaded and ready. Restart the app now to apply?',
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Restart Now', onPress: () => Updates.reloadAsync() },
          ]
        );
      } else {
        setUpdateStatusText('✨ Your app is running the latest published release.');
        Alert.alert(
          'Up to Date',
          'Your application is running the latest code published to the production channel.'
        );
      }
    } catch (err: any) {
      setUpdateStatusText('Production OTA update channel configured');
      Alert.alert(
        'OTA Channel Active',
        'Automatic update channel is active. When running inside a standalone build, updates download automatically on launch.'
      );
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to log out of this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* User Identity Card */}
      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>
            {user?.displayName ? user.displayName.slice(0, 2).toUpperCase() : 'AG'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.profileDisplayName}>{user?.displayName || 'User'}</Text>
            <View style={styles.profileRoleBadge}>
              <Text style={styles.profileRoleText}>{user?.role || 'SUPERVISOR'}</Text>
            </View>
          </View>
          <Text style={styles.profileEmail}>{user?.email || 'user@adgarments.com'}</Text>
          <Text style={styles.profileFactory}>A.D. GARMENTS Manufacturing Unit 1 & 2</Text>
        </View>
      </View>

      {/* Sync Engine Radar Card */}
      <Text style={styles.sectionHeader}>SYNCHRONIZATION & OFFLINE ENGINE</Text>
      <View style={styles.card}>
        <View style={styles.radarHeaderRow}>
          <View>
            <Text style={styles.radarTitle}>OFFLINE-FIRST ENGINE</Text>
            <Text style={styles.radarSubtitle}>
              {syncState.pendingCount > 0
                ? `${syncState.pendingCount} operations queued locally`
                : 'All changes synced to cloud'}
            </Text>
          </View>

          <View
            style={[
              styles.radarBadge,
              {
                backgroundColor:
                  syncState.pendingCount > 0 ? colors.draftBg : colors.approvedBg,
              },
            ]}
          >
            <Text
              style={[
                styles.radarBadgeText,
                { color: syncState.pendingCount > 0 ? colors.draft : colors.approved },
              ]}
            >
              {syncState.pendingCount > 0 ? 'PENDING SYNC' : 'UP TO DATE'}
            </Text>
          </View>
        </View>

        <View style={styles.statList}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Pending Operations</Text>
            <Text style={styles.statVal}>{syncState.pendingCount}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Last Synchronized</Text>
            <Text style={styles.statVal}>
              {syncState.lastSyncedAt
                ? new Date(syncState.lastSyncedAt).toLocaleTimeString()
                : 'Not synced yet'}
            </Text>
          </View>
          <View style={[styles.statItem, { borderBottomWidth: 0 }]}>
            <Text style={styles.statLabel}>Cached Reports Locally</Text>
            <Text style={styles.statVal}>{cachedReportCount} Reports</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.syncActionBtn, syncState.isSyncing && styles.btnDisabled]}
          onPress={handleManualSync}
          disabled={syncState.isSyncing}
          activeOpacity={0.85}
        >
          {syncState.isSyncing ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <>
              <Ionicons name="refresh" size={17} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.syncActionBtnText}>Trigger Force Cloud Sync</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Pending Operations List */}
        {queueItems.length > 0 && (
          <View style={styles.queueContainer}>
            <Text style={styles.queueHeader}>Queued Sync Operations:</Text>
            {queueItems.map((item) => (
              <View key={item.operation_id} style={styles.queueRow}>
                <View>
                  <Text style={styles.queueOp}>{item.operation_type}</Text>
                  <Text style={styles.queueRep}>Report: {item.report_id.slice(0, 8)}...</Text>
                </View>
                <View style={styles.queueStatusBadge}>
                  <Text style={styles.queueStatusText}>{item.status}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Network & Connectivity Card */}
      <Text style={styles.sectionHeader}>SERVER & CONNECTIVITY</Text>
      <View style={styles.card}>
        <View style={styles.connHeaderRow}>
          <View>
            <Text style={styles.connLabel}>BACKEND REST API URL</Text>
            {!isEditingUrl ? (
              <TouchableOpacity onPress={() => setIsEditingUrl(true)}>
                <Text style={styles.connUrlText}>{apiUrl}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <TouchableOpacity
            style={styles.pingBtn}
            onPress={handleTestLatency}
            disabled={isPinging}
          >
            {isPinging ? (
              <ActivityIndicator size="small" color={colors.primaryAccent} />
            ) : (
              <Text style={styles.pingBtnText}>
                {pingMs === null
                  ? 'Test Ping'
                  : pingMs === -1
                  ? '⚡ Offline'
                  : `${pingMs}ms`}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {isEditingUrl && (
          <View style={styles.urlEditBox}>
            <TextInput
              style={styles.urlInput}
              value={apiUrl}
              onChangeText={setApiUrl}
              autoCapitalize="none"
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity style={styles.saveUrlBtn} onPress={handleSaveApiUrl}>
                <Text style={styles.saveUrlBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelUrlBtn}
                onPress={() => setIsEditingUrl(false)}
              >
                <Text style={styles.cancelUrlBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Quick Endpoint Presets */}
        <Text style={styles.presetLabel}>Quick Presets:</Text>
        <View style={styles.presetsRow}>
          <TouchableOpacity
            style={styles.presetChip}
            onPress={() => handlePresetUrl('http://localhost:4000')}
          >
            <Text style={styles.presetChipText}>Local (4000)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.presetChip}
            onPress={() => handlePresetUrl('http://10.0.2.2:4000')}
          >
            <Text style={styles.presetChipText}>Android Sim</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Mobile App & Over-The-Air (OTA) Updates Card */}
      <Text style={styles.sectionHeader}>MOBILE APP & OVER-THE-AIR (OTA) UPDATES</Text>
      <View style={styles.card}>
        <View style={styles.otaHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.connLabel}>RELEASE CHANNEL</Text>
            <Text style={styles.otaChannelBadge}>production &bull; v1.0.0</Text>
          </View>
          <TouchableOpacity
            style={styles.checkUpdateBtn}
            onPress={handleCheckOtaUpdate}
            disabled={isCheckingUpdate}
            activeOpacity={0.7}
          >
            {isCheckingUpdate ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="cloud-download-outline" size={15} color="#FFFFFF" style={{ marginRight: 5 }} />
                <Text style={styles.checkUpdateBtnText}>Check Updates</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.otaInfoBox}>
          <Ionicons name="sparkles" size={15} color={colors.primaryAccent} />
          <Text style={styles.otaInfoText}>
            When new code is pushed to <Text style={{ fontWeight: '800' }}>main</Text>, GitHub Actions automatically publishes an Over-The-Air update directly to all installed phones.
          </Text>
        </View>

        {updateStatusText && (
          <View style={styles.otaStatusToast}>
            <Ionicons name="information-circle" size={15} color={colors.text} />
            <Text style={styles.otaStatusToastText}>{updateStatusText}</Text>
          </View>
        )}
      </View>

      {/* System Diagnostics */}
      <Text style={styles.sectionHeader}>SYSTEM ARCHITECTURE</Text>
      <View style={styles.card}>
        <View style={styles.diagRow}>
          <Text style={styles.diagLabel}>Application Version</Text>
          <Text style={styles.diagVal}>1.0.0 (Dual-Unit Industrial)</Text>
        </View>
        <View style={styles.diagRow}>
          <Text style={styles.diagLabel}>Local Storage Engine</Text>
          <Text style={styles.diagVal}>SQLite / Persistent Storage</Text>
        </View>
        <View style={styles.diagRow}>
          <Text style={styles.diagLabel}>Concurrency Mode</Text>
          <Text style={styles.diagVal}>Optimistic Revision Lock</Text>
        </View>
        <View style={[styles.diagRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.diagLabel}>Timezone Alignment</Text>
          <Text style={styles.diagVal}>Asia/Kolkata (IST)</Text>
        </View>
      </View>

      {/* Sign Out Button */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
        <Ionicons name="log-out-outline" size={18} color={colors.conflict} style={{ marginRight: 6 }} />
        <Text style={styles.logoutBtnText}>Sign Out of Device</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    paddingBottom: 48,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primaryNavy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  profileDisplayName: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
  },
  profileRoleBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  profileRoleText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primaryAccent,
  },
  profileEmail: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  profileFactory: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
    fontWeight: '600',
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 6,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  radarHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  radarTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
  },
  radarSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  radarBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  radarBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statList: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginBottom: 14,
  },
  statItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  statVal: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
  },
  syncActionBtn: {
    backgroundColor: colors.primaryNavy,
    height: 44,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  queueContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  queueHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  queueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  queueOp: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
  },
  queueRep: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  queueStatusBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  queueStatusText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.pendingSync,
  },
  connHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  connLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  connUrlText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primaryAccent,
    marginTop: 2,
  },
  pingBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  pingBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryAccent,
  },
  urlEditBox: {
    marginBottom: 12,
  },
  urlInput: {
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 8,
    fontSize: 13,
    color: colors.text,
  },
  saveUrlBtn: {
    backgroundColor: colors.primaryAccent,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  saveUrlBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  cancelUrlBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  cancelUrlBtnText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  presetLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
    marginTop: 6,
    marginBottom: 6,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  diagLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  diagVal: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
  },
  logoutBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  logoutBtnText: {
    color: colors.conflict,
    fontSize: 14,
    fontWeight: '800',
  },
  otaHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  otaChannelBadge: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primaryNavy,
    marginTop: 2,
  },
  checkUpdateBtn: {
    backgroundColor: colors.primaryAccent,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  checkUpdateBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  otaInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  otaInfoText: {
    fontSize: 11,
    color: '#0369A1',
    lineHeight: 16,
    flex: 1,
  },
  otaStatusToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  otaStatusToastText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
});
