import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { UserDto } from '../types';
import * as authApi from '../api/auth';
import {
  clearTokens,
  getAccessToken,
  onAccessTokenChange,
  registerLogoutHandler,
  setTokens,
} from '../api/client';
import { connectRealtime, disconnectRealtime } from '../socket';
import { useNotificationsStore } from '../store/notifications';
import { useAppointmentsStore } from '../store/appointments';

interface AuthContextValue {
  user: UserDto | null;
  /** True while the initial /auth/me bootstrap is in flight. */
  loading: boolean;
  login: (email: string, password: string) => Promise<UserDto>;
  register: (payload: authApi.RegisterPayload) => Promise<UserDto>;
  logout: () => void;
  /** Updates the cached user (e.g. after changing the phone number in settings). */
  updateUser: (user: UserDto) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    clearTokens();
    disconnectRealtime();
    useNotificationsStore.getState().reset();
    useAppointmentsStore.getState().reset();
    setUser(null);
  }, []);

  // Let the axios interceptor force a logout when refresh fails.
  useEffect(() => {
    registerLogoutHandler(logout);
  }, [logout]);

  // Bootstrap: if a token exists, load /auth/me.
  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    authApi
      .getMe()
      .then((me) => setUser(me))
      .catch(() => clearTokens())
      .finally(() => setLoading(false));
  }, []);

  // While logged in: keep the socket connected and reconnect on token refresh.
  useEffect(() => {
    if (!user) return;
    const token = getAccessToken();
    if (token) connectRealtime(token);
    void useNotificationsStore.getState().fetch();
    const unsubscribe = onAccessTokenChange((newToken) => {
      if (newToken) connectRealtime(newToken);
    });
    return () => {
      unsubscribe();
    };
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setTokens(res.accessToken, res.refreshToken);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (payload: authApi.RegisterPayload) => {
    const res = await authApi.register(payload);
    setTokens(res.accessToken, res.refreshToken);
    setUser(res.user);
    return res.user;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser: setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
