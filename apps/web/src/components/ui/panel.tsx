import type { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

export function Panel({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <section
      className={cn(
        "rounded-3xl border border-slate-800/80 bg-slate-900/65 p-5 shadow-glow backdrop-blur",
        className,
      )}
    >
      {children}
    </section>
  );
}

