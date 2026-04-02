import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  uiSize?: "md" | "sm";
}

const sizeStyles = {
  md: "h-10 rounded-xl px-3.5 text-sm",
  sm: "h-[2.125rem] rounded-lg px-3 text-[13px]",
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ uiSize = "md", ...props }, ref) {
  return (
    <input
      {...props}
      ref={ref}
      className={cn(
        "w-full border border-slate-700/70 bg-slate-950/70 text-slate-100 placeholder:text-slate-500 focus:border-accent",
        sizeStyles[uiSize],
        props.className,
      )}
    />
  );
});
