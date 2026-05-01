import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { DEV_USER, isDevMode } from '../config/devMode';

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
    localStorage.setItem('branchId', id);
  };

  useEffect(() => {
    try {
      if (isDevMode) {
        setUser(DEV_USER);
        setBranchId(DEV_USER.branchId);
        localStorage.setItem('user', JSON.stringify(DEV_USER));
        localStorage.setItem('token', 'dev-token');
        localStorage.setItem('branchId', DEV_USER.branchId);
        localStorage.setItem('tokenExpiry', String(Date.now() + TOKEN_TTL_MS));
        setIsInitialized(true);
        return;
      }

      const storedUser = localStorage.getItem('user');
      const storedToken = localStorage.getItem('token');
      const storedBranchId = localStorage.getItem('branchId');
      const tokenExpiryRaw = localStorage.getItem('tokenExpiry');

      if (tokenExpiryRaw) {
        const tokenExpiry = Number(tokenExpiryRaw);
        if (!Number.isFinite(tokenExpiry) || tokenExpiry <= Date.now()) {
          localStorage.removeItem('user');
          localStorage.removeItem('token');
          localStorage.removeItem('branchId');
          localStorage.removeItem('tokenExpiry');
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
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      localStorage.removeItem('branchId');
      localStorage.removeItem('tokenExpiry');
    } finally {
      setIsInitialized(true);
    }
  }, []);

  const login = (user: User, token: string) => {
    setUser(user);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
    localStorage.setItem('tokenExpiry', String(Date.now() + TOKEN_TTL_MS));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('branchId');
    localStorage.removeItem('tokenExpiry');
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
