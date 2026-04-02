import type { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  children,
  className,
  size = "md",
}: PropsWithChildren<{
  className?: string;
  size?: "md" | "sm";
}>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-slate-700/70 bg-slate-900/80 font-medium text-slate-300",
        size === "md" ? "px-2.5 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]",
        className,
      )}
    >
      {children}
    </span>
  );
}
