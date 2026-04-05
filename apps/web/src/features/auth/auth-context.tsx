import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router-dom";
import { toast } from "react-hot-toast";
import { AUTH_EXPIRED_EVENT, api } from "@/services/api";
import type { AuthSession, User } from "@/types/api";
import { getStoredToken, setStoredToken } from "./token-storage";
import { roleHasPermission, type AccessPermission } from "@tv-dash/shared";

interface AuthContextValue {
  token: string | null;
  user: User | null;
  session: AuthSession | null;
  loading: boolean;
  authNotice: string | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithLdap: (identifier: string, password: string) => Promise<void>;
  consumeOidcLogin: () => Promise<string>;
  logout: () => Promise<void>;
  clearAuthNotice: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const clearSession = useCallback((notice?: string | null) => {
    setStoredToken(null);
    setToken(null);
    setUser(null);
    setSession(null);
    setAuthNotice(notice ?? null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const response = await api.me(token);
        if (!cancelled) {
          setUser(response.user);
          setSession(response.session);
          setAuthNotice(null);
        }
      } catch {
        if (!cancelled) {
          clearSession("Your session expired or was revoked. Sign in again.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [clearSession, token]);

  useEffect(() => {
    function handleAuthExpired(event: Event) {
      const message =
        event instanceof CustomEvent && typeof event.detail?.message === "string"
          ? event.detail.message
          : "Your session expired or was revoked. Sign in again.";
      clearSession(message);
    }

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    };
  }, [clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.login({ email, password });
    setStoredToken(response.token);
    setToken(response.token);
    setUser(response.user);
    setSession(response.session);
    setAuthNotice(null);
    queryClient.clear();
    toast.success(`Welcome back, ${response.user.username}`);
  }, [queryClient]);

  const loginWithLdap = useCallback(async (identifier: string, password: string) => {
    const response = await api.loginWithLdap({ identifier, password });
    setStoredToken(response.token);
    setToken(response.token);
    setUser(response.user);
    setSession(response.session);
    setAuthNotice(null);
    queryClient.clear();
    toast.success(`Signed in via ${response.session.providerName ?? "directory"}`);
  }, [queryClient]);

  const consumeOidcLogin = useCallback(async () => {
    const response = await api.consumeOidcLogin();
    setStoredToken(response.token);
    setToken(response.token);
    setUser(response.user);
    setSession(response.session);
    setAuthNotice(null);
    queryClient.clear();
    toast.success(`Signed in via ${response.session.providerName ?? "single sign-on"}`);
    return response.nextPath;
  }, [queryClient]);

  const logout = useCallback(async () => {
    const currentToken = token;
    let logoutUrl: string | null = null;

    if (currentToken) {
      try {
        logoutUrl = (await api.logout(currentToken)).logoutUrl;
      } catch {
        // Expired sessions are already handled centrally by the auth-expired event.
      }
    }

    clearSession(null);
    toast.success("Signed out");

    if (logoutUrl) {
      window.location.assign(logoutUrl);
    }
  }, [clearSession, token]);

  const clearAuthNotice = useCallback(() => {
    setAuthNotice(null);
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      session,
      loading,
      authNotice,
      login,
      loginWithLdap,
      consumeOidcLogin,
      logout,
      clearAuthNotice,
    }),
    [authNotice, clearAuthNotice, consumeOidcLogin, loading, login, loginWithLdap, logout, session, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

function FullscreenGate({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 px-6 py-5 text-sm text-slate-300 shadow-glow">
        {label}
      </div>
    </div>
  );
}

export function RequireAuth({ children }: PropsWithChildren) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FullscreenGate label="Restoring your control room..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

export function RequireAdmin({ children }: PropsWithChildren) {
  return <RequirePermission permission="admin:access">{children}</RequirePermission>;
}

export function RequirePermission({
  children,
  permission,
}: PropsWithChildren<{ permission: AccessPermission }>) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FullscreenGate label="Checking admin access..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!roleHasPermission(user.role, permission)) {
    return <Navigate to="/forbidden" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
