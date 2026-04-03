import { Link, useLocation } from "react-router-dom";
import { Panel } from "@/components/ui/panel";

export function ForbiddenPage() {
  const location = useLocation();
  const attemptedPath = (location.state as { from?: string } | null)?.from;

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Panel className="max-w-xl">
        <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Protected Area</p>
        <h1 className="mt-3 text-2xl font-bold text-white">Admin access is required</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          This area is reserved for administrative operations. Server-side permission checks blocked access before any
          sensitive data or controls were exposed.
        </p>
        {attemptedPath ? (
          <p className="mt-3 text-xs text-slate-500">Requested path: {attemptedPath}</p>
        ) : null}
        <div className="mt-5">
          <Link
            className="inline-flex h-[1.875rem] items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900/70 px-2.5 text-[12px] font-semibold text-slate-100 transition hover:bg-slate-800"
            to="/"
          >
            Back to channels
          </Link>
        </div>
      </Panel>
    </div>
  );
}
