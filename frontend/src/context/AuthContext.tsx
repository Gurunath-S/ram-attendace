import React, { createContext, useContext, useState, useEffect } from 'react';
import { ApiClient, UserSession } from '../services/api';
import { AppStorage } from '../services/storage';

interface AuthContextType {
  user: UserSession | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  isSupervisor: boolean;
  isManager: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadCachedSession();
  }, []);

  const loadCachedSession = async () => {
    try {
      await ApiClient.init();
      const savedToken = await AppStorage.getItem('auth_token');
      const savedUserStr = await AppStorage.getItem('auth_user');

      if (savedToken && savedUserStr) {
        setToken(savedToken);
        const parsed = JSON.parse(savedUserStr);
        setUser(parsed);

        // Background refresh if online
        ApiClient.getMe()
          .then((fresh) => {
            setUser(fresh);
            AppStorage.setItem('auth_user', JSON.stringify(fresh));
          })
          .catch((err) => {
            console.log('[Auth] Running with cached offline session:', err.message);
          });
      }
    } catch (e) {
      console.warn('[Auth] Session load error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, pass: string) => {
    setIsLoading(true);
    try {
      const res = await ApiClient.login(email, pass);
      setToken(res.token);
      setUser(res.user);

      await AppStorage.setItem('auth_token', res.token);
      await AppStorage.setItem('auth_user', JSON.stringify(res.user));
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setUser(null);
    setToken(null);
    await AppStorage.removeItem('auth_token');
    await AppStorage.removeItem('auth_user');
  };

  const isSupervisor = user?.role === 'SUPERVISOR';
  const isManager = user?.role === 'MANAGER';
  const isAdmin = user?.role === 'ADMIN';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        logout,
        isSupervisor,
        isManager,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
