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
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [apiUrl, setApiUrl] = useState(ApiClient.getBaseUrl());
  const [isEditingUrl, setIsEditingUrl] = useState(false);

  useEffect(() => {
    const unsub = syncEngine.subscribe(setSyncState);
    loadQueue();
    return () => {
      unsub();
    };
  }, []);

  const loadQueue = async () => {
    setLoadingQueue(true);
    try {
      const items = await dbService.getPendingSyncOperations();
      setQueueItems(items);
    } finally {
      setLoadingQueue(false);
    }
  };

  const handleManualSync = async () => {
    const res = await syncEngine.triggerSync();
    if (res.success) {
      Alert.alert('Sync Complete', 'All pending operations synchronized with server.');
    } else {
      Alert.alert('Sync Incomplete', res.error || 'Server unreachable. Changes remain stored locally.');
    }
    await loadQueue();
  };

  const handleSaveApiUrl = async () => {
    await ApiClient.setBaseUrl(apiUrl.trim());
    setIsEditingUrl(false);
    Alert.alert('Saved', 'API Base URL updated.');
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to log out of this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Account Info */}
      <Text style={styles.sectionTitle}>ACCOUNT DETAILS</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Name</Text>
          <Text style={styles.val}>{user?.displayName}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.val}>{user?.email}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Role</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>{user?.role}</Text>
          </View>
        </View>
        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <Text style={styles.label}>Factory</Text>
          <Text style={styles.val}>A.D. GARMENTS</Text>
        </View>
      </View>

      {/* Sync Engine Manager */}
      <Text style={styles.sectionTitle}>OFFLINE SYNCHRONIZATION ENGINE</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Pending Queue</Text>
          <Text style={[styles.val, { fontWeight: '800', color: syncState.pendingCount > 0 ? colors.pendingSync : colors.synced }]}>
            {syncState.pendingCount} Operations
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Last Synced At</Text>
          <Text style={styles.val}>
            {syncState.lastSyncedAt
              ? new Date(syncState.lastSyncedAt).toLocaleTimeString()
              : 'Never'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.syncButton, syncState.isSyncing && styles.btnDisabled]}
          onPress={handleManualSync}
          disabled={syncState.isSyncing}
        >
          {syncState.isSyncing ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Ionicons name="refresh" size={18} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.syncButtonText}>Trigger Force Synchronization</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Pending Operations List */}
        {queueItems.length > 0 && (
          <View style={styles.queueContainer}>
            <Text style={styles.queueTitle}>Pending Sync Operations:</Text>
            {queueItems.map((item) => (
              <View key={item.operation_id} style={styles.queueItem}>
                <View>
                  <Text style={styles.queueOpType}>{item.operation_type}</Text>
                  <Text style={styles.queueReportId}>Report: {item.report_id.slice(0, 8)}...</Text>
                </View>
                <View style={styles.queueStatusBadge}>
                  <Text style={styles.queueStatusText}>{item.status}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Network / Server Settings */}
      <Text style={styles.sectionTitle}>SERVER & CONNECTIVITY</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>API Base URL</Text>
          {!isEditingUrl ? (
            <TouchableOpacity onPress={() => setIsEditingUrl(true)}>
              <Text style={[styles.val, { color: colors.primaryAccent }]}>{apiUrl}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {isEditingUrl && (
          <View style={{ marginTop: 8 }}>
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
      </View>

      {/* Application Diagnostics */}
      <Text style={styles.sectionTitle}>DIAGNOSTICS & SYSTEM</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>App Version</Text>
          <Text style={styles.val}>1.0.0 (Production)</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Database Engine</Text>
          <Text style={styles.val}>SQLite (WAL Mode)</Text>
        </View>
        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <Text style={styles.label}>Environment</Text>
          <Text style={styles.val}>Expo / React Native</Text>
        </View>
      </View>

      {/* Sign Out Button */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={18} color={colors.conflict} style={{ marginRight: 6 }} />
        <Text style={styles.logoutButtonText}>Sign Out of Device</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceSubtle,
  },
  label: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  val: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  roleBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryAccent,
  },
  syncButton: {
    backgroundColor: colors.primary,
    height: 44,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  syncButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  queueContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  queueTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  queueItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  queueOpType: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  queueReportId: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  queueStatusBadge: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  queueStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.pendingSync,
  },
  urlInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 8,
    fontSize: 13,
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
    backgroundColor: colors.surfaceSubtle,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  cancelUrlBtnText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  logoutButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    height: 46,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  logoutButtonText: {
    color: colors.conflict,
    fontSize: 14,
    fontWeight: '700',
  },
});
