import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "react-router-dom";
export function NotFoundPage() {
    return (_jsx("div", { className: "flex min-h-screen items-center justify-center px-4", children: _jsxs("div", { className: "max-w-md rounded-[2rem] border border-slate-800 bg-slate-900/80 p-8 text-center shadow-glow", children: [_jsx("p", { className: "text-xs uppercase tracking-[0.3em] text-accent/80", children: "404" }), _jsx("h1", { className: "mt-3 text-3xl font-bold text-white", children: "That route is off-air." }), _jsx("p", { className: "mt-3 text-sm leading-6 text-slate-400", children: "The page you requested does not exist in the current TV-Dash workspace." }), _jsx(Link, { className: "mt-6 inline-flex items-center justify-center rounded-2xl bg-accent px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200", to: "/", children: "Return to dashboard" })] }) }));
}
