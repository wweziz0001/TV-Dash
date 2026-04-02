import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from "@/lib/utils";
export function Badge({ children, className, }) {
    return (_jsx("span", { className: cn("inline-flex items-center rounded-full border border-slate-700/70 bg-slate-900/80 px-3 py-1 text-xs font-medium text-slate-300", className), children: children }));
}
