import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from "@/lib/utils";
export function Panel({ children, className }) {
    return (_jsx("section", { className: cn("rounded-3xl border border-slate-800/80 bg-slate-900/65 p-5 shadow-glow backdrop-blur", className), children: children }));
}
