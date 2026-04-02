import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { useAuth } from "@/features/auth/auth-context";
export function LoginPage() {
    const location = useLocation();
    const { login, user } = useAuth();
    const [email, setEmail] = useState("admin@tvdash.local");
    const [password, setPassword] = useState("Admin123!");
    const [submitting, setSubmitting] = useState(false);
    if (user) {
        const nextPath = location.state?.from?.pathname ?? "/";
        return _jsx(Navigate, { to: nextPath, replace: true });
    }
    async function handleSubmit(event) {
        event.preventDefault();
        setSubmitting(true);
        try {
            await login(email, password);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to sign in");
        }
        finally {
            setSubmitting(false);
        }
    }
    return (_jsx("div", { className: "flex min-h-screen items-center justify-center px-4 py-12", children: _jsxs("div", { className: "grid max-w-6xl gap-6 lg:grid-cols-[1.2fr_0.8fr]", children: [_jsx(Panel, { className: "overflow-hidden border-cyan-500/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-0", children: _jsxs("div", { className: "grid gap-6 p-8 lg:grid-cols-[1.2fr_0.8fr] lg:p-10", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs uppercase tracking-[0.32em] text-accent/80", children: "TV-Dash" }), _jsx("h1", { className: "mt-5 max-w-xl text-4xl font-bold leading-tight text-white", children: "Self-hosted IPTV monitoring with real HLS playback and multi-view walls." }), _jsx("p", { className: "mt-5 max-w-xl text-base leading-7 text-slate-400", children: "This build ships a working MVP: channel admin, real HLS.js quality selection, favorites, saved layouts, and control-room friendly watching." }), _jsxs("div", { className: "mt-8 grid gap-3 text-sm text-slate-300 sm:grid-cols-2", children: [_jsx("div", { className: "rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4", children: "Real master playlist quality detection" }), _jsx("div", { className: "rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4", children: "Admin CRUD for channels and groups" }), _jsx("div", { className: "rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4", children: "2x2, 3x3, and focus multi-view layouts" }), _jsx("div", { className: "rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4", children: "Saved walls, favorites, and stream testing" })] })] }), _jsxs(Panel, { className: "border-slate-800/80 bg-slate-950/70", children: [_jsx("p", { className: "text-xs uppercase tracking-[0.28em] text-slate-500", children: "Seeded Access" }), _jsxs("div", { className: "mt-4 space-y-3 text-sm text-slate-300", children: [_jsxs("div", { className: "rounded-2xl bg-slate-900/70 p-3", children: [_jsx("p", { className: "font-semibold text-white", children: "Admin" }), _jsx("p", { children: "admin@tvdash.local / Admin123!" })] }), _jsxs("div", { className: "rounded-2xl bg-slate-900/70 p-3", children: [_jsx("p", { className: "font-semibold text-white", children: "Viewer" }), _jsx("p", { children: "viewer@tvdash.local / Viewer123!" })] })] })] })] }) }), _jsxs(Panel, { className: "self-center", children: [_jsx("p", { className: "text-xs uppercase tracking-[0.28em] text-slate-500", children: "Operator Sign-In" }), _jsx("h2", { className: "mt-3 text-2xl font-bold text-white", children: "Enter the control room" }), _jsxs("form", { className: "mt-6 space-y-4", onSubmit: handleSubmit, children: [_jsxs("div", { children: [_jsx("label", { className: "mb-2 block text-sm text-slate-400", htmlFor: "email", children: "Email" }), _jsx(Input, { id: "email", value: email, onChange: (event) => setEmail(event.target.value) })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-2 block text-sm text-slate-400", htmlFor: "password", children: "Password" }), _jsx(Input, { id: "password", type: "password", value: password, onChange: (event) => setPassword(event.target.value) })] }), _jsx(Button, { className: "w-full", disabled: submitting, type: "submit", children: submitting ? "Signing in..." : "Sign In" })] })] })] }) }));
}
