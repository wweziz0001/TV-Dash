import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md rounded-[2rem] border border-slate-800 bg-slate-900/80 p-8 text-center shadow-glow">
        <p className="text-xs uppercase tracking-[0.3em] text-accent/80">404</p>
        <h1 className="mt-3 text-3xl font-bold text-white">That route is off-air.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          The page you requested does not exist in the current TV-Dash workspace.
        </p>
        <Link
          className="mt-6 inline-flex items-center justify-center rounded-2xl bg-accent px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
          to="/"
        >
          Return to dashboard
        </Link>
      </div>
    </div>
  );
}
