import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from "@/lib/utils";
export function Select(props) {
    return (_jsx("select", { ...props, className: cn("w-full rounded-2xl border border-slate-700/70 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 focus:border-accent", props.className) }));
}
