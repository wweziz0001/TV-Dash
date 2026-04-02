import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router-dom";
import { toast } from "react-hot-toast";
import { api, getStoredToken, setStoredToken } from "@/lib/api";
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
    const queryClient = useQueryClient();
    const [token, setToken] = useState(() => getStoredToken());
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
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
                }
            }
            catch {
                if (!cancelled) {
                    setStoredToken(null);
                    setToken(null);
                    setUser(null);
                }
            }
            finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }
        void loadSession();
        return () => {
            cancelled = true;
        };
    }, [token]);
    const login = useCallback(async (email, password) => {
        const response = await api.login({ email, password });
        setStoredToken(response.token);
        setToken(response.token);
        setUser(response.user);
        queryClient.clear();
        toast.success(`Welcome back, ${response.user.username}`);
    }, [queryClient]);
    const logout = useCallback(() => {
        setStoredToken(null);
        setToken(null);
        setUser(null);
        queryClient.clear();
        toast.success("Signed out");
    }, [queryClient]);
    const value = useMemo(() => ({
        token,
        user,
        loading,
        login,
        logout,
    }), [loading, login, logout, token, user]);
    return _jsx(AuthContext.Provider, { value: value, children: children });
}
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within AuthProvider");
    }
    return context;
}
function FullscreenGate({ label }) {
    return (_jsx("div", { className: "flex min-h-screen items-center justify-center", children: _jsx("div", { className: "rounded-3xl border border-slate-800 bg-slate-900/80 px-6 py-5 text-sm text-slate-300 shadow-glow", children: label }) }));
}
export function RequireAuth({ children }) {
    const { user, loading } = useAuth();
    const location = useLocation();
    if (loading) {
        return _jsx(FullscreenGate, { label: "Restoring your control room..." });
    }
    if (!user) {
        return _jsx(Navigate, { to: "/login", replace: true, state: { from: location } });
    }
    return _jsx(_Fragment, { children: children });
}
export function RequireAdmin({ children }) {
    const { user, loading } = useAuth();
    if (loading) {
        return _jsx(FullscreenGate, { label: "Checking admin access..." });
    }
    if (!user) {
        return _jsx(Navigate, { to: "/login", replace: true });
    }
    if (user.role !== "ADMIN") {
        return _jsx(Navigate, { to: "/", replace: true });
    }
    return _jsx(_Fragment, { children: children });
}
