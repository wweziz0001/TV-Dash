import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from "@/lib/utils";
const styles = {
    primary: "bg-accent text-slate-950 hover:bg-cyan-200 shadow-[0_12px_40px_rgba(110,231,249,0.18)]",
    secondary: "bg-slate-900/70 text-slate-100 hover:bg-slate-800 border border-slate-700/80",
    ghost: "bg-transparent text-slate-300 hover:bg-slate-900/70 hover:text-white",
    danger: "bg-rose-500/90 text-white hover:bg-rose-400",
};
export function Button({ className, variant = "primary", ...props }) {
    return (_jsx("button", { className: cn("inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60", styles[variant], className), ...props }));
}
