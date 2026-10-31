import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { AppStorage } from './storage';
import { AttendanceReportRecord, AttendanceReportInput } from '@ad-garments/domain';

const LIVE_RENDER_API_URL = 'https://ram-attendace.onrender.com';

export function getDefaultApiUrl(): string {
  // 1. Explicit environment variable (from eas.json, .env, or build config)
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');
  }

  // 2. Production or standalone APK builds always default to Render cloud backend
  if (!__DEV__) {
    return LIVE_RENDER_API_URL;
  }

  // 3. In local development: check Metro bundler host IP
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any).manifest?.debuggerHost;

  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:4000`;
    }
  }

  // 4. Android Emulator loopback
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:4000';
  }

  // 5. Default fallback to live Render backend
  return LIVE_RENDER_API_URL;
}

export interface UserSession {
  id: string;
  factoryId: string;
  displayName: string;
  email: string;
  role: 'SUPERVISOR' | 'MANAGER' | 'ADMIN';
}

export class ApiClient {
  private static baseUrl = getDefaultApiUrl();

  static async init() {
    const saved = await AppStorage.getItem('api_base_url');
    if (saved) {
      this.baseUrl = saved;
    } else {
      this.baseUrl = getDefaultApiUrl();
    }
  }

  static async setBaseUrl(url: string) {
    const clean = url.trim().replace(/\/+$/, '');
    this.baseUrl = clean;
    await AppStorage.setItem('api_base_url', clean);
  }

  static getBaseUrl(): string {
    return this.baseUrl;
  }

  private static async getHeaders(): Promise<HeadersInit> {
    const token = await AppStorage.getItem('auth_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  static async request<T = any>(endpoint: string, options: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = await this.getHeaders();
    const timeoutMs = options.timeoutMs || 4000;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const config: RequestInit = {
      ...options,
      signal: controller.signal,
      headers: {
        ...headers,
        ...(options.headers || {}),
      },
    };

    let response: Response;
    try {
      response = await fetch(url, config);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Connection timed out after ${timeoutMs}ms. Running in offline/local mode.`);
      }
      throw new Error(`Network request failed: ${err.message || 'Cannot connect to server'}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      let errorBody: any = {};
      try {
        errorBody = await response.json();
      } catch {
        errorBody = { error: response.statusText };
      }
      const error: any = new Error(errorBody.error || `HTTP error ${response.status}`);
      error.status = response.status;
      error.details = errorBody.details || errorBody.issues;
      throw error;
    }

    // Check if JSON response
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return (await response.json()) as T;
    }

    return (await response.text()) as any;
  }

  // Auth
  static async login(email: string, password: string): Promise<{ token: string; user: UserSession }> {
    const res = await this.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return res;
  }

  static async getMe(): Promise<UserSession> {
    const res = await this.request('/api/v1/auth/me');
    return res.user || res;
  }

  // Config
  static async getConfig() {
    return this.request('/api/v1/config');
  }

  static async addDepartment(unitCode: string, label: string) {
    return this.request('/api/v1/config/departments', {
      method: 'POST',
      body: JSON.stringify({ unitCode, label }),
    });
  }

  static async updateDepartment(id: string, label: string) {
    return this.request(`/api/v1/config/departments/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ label }),
    });
  }

  static async deleteDepartment(id: string) {
    return this.request(`/api/v1/config/departments/${id}`, {
      method: 'DELETE',
    });
  }

  // Attendance Reports
  static async getReports(params?: { date?: string; from?: string; to?: string }): Promise<AttendanceReportRecord[]> {
    let query = '';
    if (params?.date) query = `?date=${encodeURIComponent(params.date)}`;
    else if (params?.from && params?.to) {
      query = `?from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to)}`;
    }
    const res = await this.request(`/api/v1/attendance${query}`);
    return Array.isArray(res) ? res : [res];
  }

  static async getReportById(id: string): Promise<AttendanceReportRecord> {
    return this.request(`/api/v1/attendance/${id}`);
  }

  static async saveDraft(payload: AttendanceReportInput): Promise<AttendanceReportRecord> {
    return this.request('/api/v1/attendance', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async submitReport(id: string, revision: number): Promise<AttendanceReportRecord> {
    return this.request(`/api/v1/attendance/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify({ revision }),
    });
  }

  static async approveReport(id: string): Promise<AttendanceReportRecord> {
    return this.request(`/api/v1/attendance/${id}/approve`, {
      method: 'POST',
    });
  }

  static async reopenReport(id: string): Promise<AttendanceReportRecord> {
    return this.request(`/api/v1/attendance/${id}/reopen`, {
      method: 'POST',
    });
  }

  static async getAuditEvents(id: string) {
    return this.request(`/api/v1/attendance/${id}/audit`);
  }

  // Sync
  static async syncPush(operations: any[]) {
    return this.request('/api/v1/sync/push', {
      method: 'POST',
      body: JSON.stringify({ operations }),
    });
  }

  static async syncPull(since: string) {
    return this.request(`/api/v1/sync/pull?since=${encodeURIComponent(since)}`);
  }

  // Reports & Aggregates
  static async getWeekly(weekStart: string) {
    return this.request(`/api/v1/reports/weekly?weekStart=${encodeURIComponent(weekStart)}`);
  }

  static async getMonthly(month: string) {
    return this.request(`/api/v1/reports/monthly?month=${encodeURIComponent(month)}`);
  }

  static async getPdfDocument(id: string): Promise<string> {
    const token = await AppStorage.getItem('auth_token');
    return `${this.baseUrl}/api/v1/reports/${id}/pdf?token=${encodeURIComponent(token || '')}`;
  }
}
