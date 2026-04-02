import type { PropsWithChildren, ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  density = "default",
}: PropsWithChildren<{
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  density?: "default" | "compact";
}>) {
  return (
    <section
      className={density === "compact"
        ? "rounded-[1.5rem] border border-slate-800/80 bg-slate-950/60 p-4 shadow-glow backdrop-blur"
        : "rounded-[1.75rem] border border-slate-800/80 bg-slate-950/60 p-5 shadow-glow backdrop-blur"}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-accent/80">{eyebrow}</p>
          <h1 className={density === "compact" ? "mt-2 text-2xl font-bold text-white" : "mt-2 text-[1.75rem] font-bold text-white"}>
            {title}
          </h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-5 text-slate-400">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}
