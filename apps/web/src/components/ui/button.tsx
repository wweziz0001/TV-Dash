import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "md" | "sm" | "icon-md" | "icon-sm";

const styles: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-slate-950 hover:bg-cyan-200 shadow-[0_12px_40px_rgba(110,231,249,0.18)]",
  secondary:
    "bg-slate-900/70 text-slate-100 hover:bg-slate-800 border border-slate-700/80",
  ghost: "bg-transparent text-slate-300 hover:bg-slate-900/70 hover:text-white",
  danger: "bg-rose-500/90 text-white hover:bg-rose-400",
};

const sizeStyles: Record<ButtonSize, string> = {
  md: "h-9 rounded-xl px-3 text-[13px]",
  sm: "h-[1.875rem] rounded-lg px-2.5 text-[12px]",
  "icon-md": "h-9 w-9 rounded-xl p-0",
  "icon-sm": "h-[1.875rem] w-[1.875rem] rounded-lg p-0",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ className, variant = "primary", size = "md", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        styles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    />
  );
}
