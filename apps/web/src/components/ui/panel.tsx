import type { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  children,
  className,
  density = "default",
}: PropsWithChildren<{ className?: string; density?: "default" | "compact" | "flush" }>) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-slate-800/80 bg-slate-900/65 shadow-glow backdrop-blur",
        density === "default" && "p-4",
        density === "compact" && "p-3",
        density === "flush" && "p-0",
        className,
      )}
    >
      {children}
    </section>
  );
}
