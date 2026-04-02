import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  uiSize?: "md" | "sm";
}

const sizeStyles = {
  md: "h-10 rounded-xl px-3.5 text-sm",
  sm: "h-[2.125rem] rounded-lg px-3 text-[13px]",
};

export function Select({ uiSize = "md", ...props }: SelectProps) {
  return (
    <select
      {...props}
      className={cn(
        "w-full border border-slate-700/70 bg-slate-950/70 text-slate-100 focus:border-accent",
        sizeStyles[uiSize],
        props.className,
      )}
    />
  );
}
