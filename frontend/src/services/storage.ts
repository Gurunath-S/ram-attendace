import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export class AppStorage {
  static async setItem(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, value);
        }
      } else {
        await SecureStore.setItemAsync(key, value);
      }
    } catch (e) {
      console.warn(`[Storage] Failed to set ${key}:`, e);
    }
  }

  static async getItem(key: string): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(key);
        }
        return null;
      } else {
        return await SecureStore.getItemAsync(key);
      }
    } catch (e) {
      console.warn(`[Storage] Failed to get ${key}:`, e);
      return null;
    }
  }

  static async removeItem(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
        }
      } else {
        await SecureStore.deleteItemAsync(key);
      }
    } catch (e) {
      console.warn(`[Storage] Failed to remove ${key}:`, e);
    }
  }
}
