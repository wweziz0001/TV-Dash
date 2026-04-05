import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { useAuth } from "@/features/auth/auth-context";
import { api } from "@/services/api";

export function LoginPage() {
  const location = useLocation();
  const { authNotice, clearAuthNotice, login, loginWithLdap, user } = useAuth();
  const [email, setEmail] = useState("admin@tvdash.local");
  const [password, setPassword] = useState("Admin123!");
  const [directoryIdentifier, setDirectoryIdentifier] = useState("");
  const [directoryPassword, setDirectoryPassword] = useState("");
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const [ldapSubmitting, setLdapSubmitting] = useState(false);
  const providersQuery = useQuery({
    queryKey: ["public-auth-providers"],
    queryFn: async () => (await api.getPublicAuthProviders()).providers,
  });

  const nextPath = (location.state as { from?: { pathname?: string } })?.from?.pathname ?? "/";

  if (user) {
    return <Navigate to={nextPath} replace />;
  }

  async function handleLocalSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalSubmitting(true);
    try {
      await login(email, password);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign in");
    } finally {
      setLocalSubmitting(false);
    }
  }

  async function handleLdapSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLdapSubmitting(true);
    try {
      await loginWithLdap(directoryIdentifier, directoryPassword);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign in with LDAP");
    } finally {
      setLdapSubmitting(false);
    }
  }

  const ldapProvider = providersQuery.data?.ldap ?? null;
  const oidcProvider = providersQuery.data?.oidc ?? null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="grid max-w-7xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Panel className="overflow-hidden border-cyan-500/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-0">
          <div className="grid gap-6 p-8 lg:grid-cols-[1.15fr_0.85fr] lg:p-10">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-accent/80">TV-Dash</p>
              <h1 className="mt-5 max-w-xl text-4xl font-bold leading-tight text-white">
                Enterprise-ready IPTV operations with local admin access, LDAP, and OIDC sign-in.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-400">
                Keep the control room accessible for local break-glass admins while connecting TV-Dash to your
                corporate directory or single sign-on provider.
              </p>
              <div className="mt-8 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">Local admin fallback stays available</div>
                <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">LDAP login can map users into TV-Dash accounts</div>
                <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">OIDC works with Keycloak-compatible providers</div>
                <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">Per-user favorites and saved walls remain intact</div>
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

        <div className="space-y-4 self-center">
          <Panel>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Operator Sign-In</p>
            <h2 className="mt-3 text-2xl font-bold text-white">Enter the control room</h2>
            {authNotice ? (
              <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                {authNotice}
              </div>
            ) : null}

            {oidcProvider ? (
              <div className="mt-6">
                <Button
                  className="w-full"
                  onClick={() => api.beginOidcLogin(nextPath)}
                  type="button"
                >
                  {oidcProvider.loginLabel}
                </Button>
                <p className="mt-2 text-xs text-slate-500">{oidcProvider.name}</p>
              </div>
            ) : null}

            <form className="mt-6 space-y-4" onSubmit={handleLocalSubmit}>
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
              <Button className="w-full" disabled={localSubmitting} type="submit">
                {localSubmitting ? "Signing in..." : "Sign in with local account"}
              </Button>
            </form>
          </Panel>

          {ldapProvider ? (
            <Panel>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">LDAP</p>
              <h2 className="mt-3 text-2xl font-bold text-white">{ldapProvider.loginLabel}</h2>
              <p className="mt-2 text-sm text-slate-400">{ldapProvider.name}</p>
              <form className="mt-6 space-y-4" onSubmit={handleLdapSubmit}>
                <div>
                  <label className="mb-2 block text-sm text-slate-400" htmlFor="directory-identifier">
                    {ldapProvider.identifierLabel}
                  </label>
                  <Input
                    id="directory-identifier"
                    placeholder={ldapProvider.identifierPlaceholder}
                    value={directoryIdentifier}
                    onChange={(event) => {
                      clearAuthNotice();
                      setDirectoryIdentifier(event.target.value);
                    }}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm text-slate-400" htmlFor="directory-password">
                    Password
                  </label>
                  <Input
                    id="directory-password"
                    type="password"
                    value={directoryPassword}
                    onChange={(event) => {
                      clearAuthNotice();
                      setDirectoryPassword(event.target.value);
                    }}
                  />
                </div>
                <Button className="w-full" disabled={ldapSubmitting} type="submit" variant="secondary">
                  {ldapSubmitting ? "Checking directory..." : "Sign in with LDAP"}
                </Button>
              </form>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
