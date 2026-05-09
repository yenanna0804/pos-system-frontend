import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { DEV_USER, isDevMode } from '../config/devMode';
import { STORAGE_KEYS } from '../config/constants';

interface User {
  id: string;
  username: string;
  fullName?: string;
  role: string;
  branchId: string;
  branchName: string;
}

interface AuthContextType {
  user: User | null;
  branchId: string;
  setBranchId: (id: string) => void;
  login: (user: User, token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isInitialized: boolean;
}

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [branchId, setBranchId] = useState<string>('');
  const [isInitialized, setIsInitialized] = useState(false);

  const setActiveBranchId = (id: string) => {
    setBranchId(id);
    localStorage.setItem(STORAGE_KEYS.BRANCH_ID, id);
  };

  useEffect(() => {
    try {
      if (isDevMode) {
        setUser(DEV_USER);
        setBranchId(DEV_USER.branchId);
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(DEV_USER));
        localStorage.setItem(STORAGE_KEYS.TOKEN, 'dev-token');
        localStorage.setItem(STORAGE_KEYS.BRANCH_ID, DEV_USER.branchId);
        localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, String(Date.now() + TOKEN_TTL_MS));
        setIsInitialized(true);
        return;
      }

      const storedUser = localStorage.getItem(STORAGE_KEYS.USER);
      const storedToken = localStorage.getItem(STORAGE_KEYS.TOKEN);
      const storedBranchId = localStorage.getItem(STORAGE_KEYS.BRANCH_ID);
      const tokenExpiryRaw = localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY);

      if (tokenExpiryRaw) {
        const tokenExpiry = Number(tokenExpiryRaw);
        if (!Number.isFinite(tokenExpiry) || tokenExpiry <= Date.now()) {
          localStorage.removeItem(STORAGE_KEYS.USER);
          localStorage.removeItem(STORAGE_KEYS.TOKEN);
          localStorage.removeItem(STORAGE_KEYS.BRANCH_ID);
          localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRY);
          setIsInitialized(true);
          return;
        }
      }

      if (storedUser && storedToken) {
        setUser(JSON.parse(storedUser));
        setBranchId(storedBranchId || '');
      }
    } catch {
      // Corrupted localStorage should not block app bootstrap.
      setUser(null);
      setBranchId('');
      localStorage.removeItem(STORAGE_KEYS.USER);
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      localStorage.removeItem(STORAGE_KEYS.BRANCH_ID);
      localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRY);
    } finally {
      setIsInitialized(true);
    }
  }, []);

  const login = (user: User, token: string) => {
    setUser(user);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, String(Date.now() + TOKEN_TTL_MS));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.BRANCH_ID);
    localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRY);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        branchId,
        setBranchId: setActiveBranchId,
        login,
        logout,
        isAuthenticated: !!user,
        isInitialized,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
