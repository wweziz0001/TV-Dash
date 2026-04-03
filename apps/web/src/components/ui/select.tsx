import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  uiSize?: "md" | "sm";
}

const sizeStyles = {
  md: "h-10 rounded-xl px-3.5 text-sm",
  sm: "h-10 rounded-xl px-3.5 text-sm sm:h-[2.125rem] sm:rounded-lg sm:px-3 sm:text-[13px]",
};

export function Select({ uiSize = "md", ...props }: SelectProps) {
  return (
    <select
      {...props}
      className={cn(
        "w-full appearance-none border border-slate-700/70 bg-slate-950/70 text-slate-200 transition-colors focus:border-accent",
        sizeStyles[uiSize],
        props.className,
      )}
    />
  );
}
