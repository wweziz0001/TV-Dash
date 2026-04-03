import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { useAuth } from "@/features/auth/auth-context";

export function LoginPage() {
  const location = useLocation();
  const { authNotice, clearAuthNotice, login, user } = useAuth();
  const [email, setEmail] = useState("admin@tvdash.local");
  const [password, setPassword] = useState("Admin123!");
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    const nextPath = (location.state as { from?: { pathname?: string } })?.from?.pathname ?? "/";
    return <Navigate to={nextPath} replace />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign in");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="grid max-w-6xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Panel className="overflow-hidden border-cyan-500/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-0">
          <div className="grid gap-6 p-8 lg:grid-cols-[1.2fr_0.8fr] lg:p-10">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-accent/80">TV-Dash</p>
              <h1 className="mt-5 max-w-xl text-4xl font-bold leading-tight text-white">
                Self-hosted IPTV monitoring with real HLS playback and multi-view walls.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-400">
                This build ships a working MVP: channel admin, real HLS.js quality selection, favorites,
                saved layouts, and control-room friendly watching.
              </p>
              <div className="mt-8 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">Real master playlist quality detection</div>
                <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">Admin CRUD for channels and groups</div>
                <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">2x2, 3x3, and focus multi-view layouts</div>
                <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">Saved walls, favorites, and stream testing</div>
              </div>
            </div>

            <Panel className="border-slate-800/80 bg-slate-950/70">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Seeded Access</p>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <div className="rounded-2xl bg-slate-900/70 p-3">
                  <p className="font-semibold text-white">Admin</p>
                  <p>admin@tvdash.local / Admin123!</p>
                </div>
                <div className="rounded-2xl bg-slate-900/70 p-3">
                  <p className="font-semibold text-white">Viewer</p>
                  <p>viewer@tvdash.local / Viewer123!</p>
                </div>
              </div>
            </Panel>
          </div>
        </Panel>

        <Panel className="self-center">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Operator Sign-In</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Enter the control room</h2>
          {authNotice ? (
            <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {authNotice}
            </div>
          ) : null}
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-sm text-slate-400" htmlFor="email">
                Email
              </label>
              <Input
                id="email"
                value={email}
                onChange={(event) => {
                  clearAuthNotice();
                  setEmail(event.target.value);
                }}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm text-slate-400" htmlFor="password">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => {
                  clearAuthNotice();
                  setPassword(event.target.value);
                }}
              />
            </div>
            <Button className="w-full" disabled={submitting} type="submit">
              {submitting ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
