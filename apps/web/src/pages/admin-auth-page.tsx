import { useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import type { LdapProviderConfigInput, OidcProviderConfigInput } from "@tv-dash/shared";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { TextArea } from "@/components/ui/text-area";
import { useAuth } from "@/features/auth/auth-context";
import { API_BASE_URL, api } from "@/services/api";

const emptyLdapForm: LdapProviderConfigInput = {
  name: "Enterprise LDAP",
  loginLabel: "Directory login",
  identifierLabel: "Username or email",
  identifierPlaceholder: "jane.doe",
  isEnabled: false,
  isVisibleOnLogin: true,
  allowAutoProvision: false,
  autoLinkByEmail: false,
  autoLinkByUsername: false,
  defaultRole: "USER",
  serverUrl: "ldaps://ldap.example.com",
  bindDn: null,
  bindPassword: "",
  clearBindPassword: false,
  userSearchBaseDn: "dc=example,dc=com",
  userSearchFilter: "(|(uid={identifier})(mail={identifier})(sAMAccountName={identifier}))",
  userSearchScope: "sub",
  usernameAttribute: "uid",
  emailAttribute: "mail",
  displayNameAttribute: "cn",
  groupAttribute: null,
  startTls: false,
  rejectUnauthorized: true,
  timeoutMs: 5000,
  connectTimeoutMs: 5000,
};

const emptyOidcForm: OidcProviderConfigInput = {
  name: "Enterprise SSO",
  loginLabel: "Continue with SSO",
  isEnabled: false,
  isVisibleOnLogin: true,
  allowAutoProvision: false,
  autoLinkByEmail: false,
  autoLinkByUsername: false,
  defaultRole: "USER",
  issuerUrl: "https://sso.example.com/realms/tv-dash",
  clientId: "tv-dash",
  clientSecret: "",
  clearClientSecret: false,
  scopes: "openid profile email",
  usernameClaim: "preferred_username",
  emailClaim: "email",
  displayNameClaim: "name",
  groupsClaim: null,
  postLogoutRedirectPath: "/login",
  requireVerifiedEmail: false,
};

export function AdminAuthPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [ldapForm, setLdapForm] = useState<LdapProviderConfigInput>(emptyLdapForm);
  const [oidcForm, setOidcForm] = useState<OidcProviderConfigInput>(emptyOidcForm);
  const [ldapTestIdentifier, setLdapTestIdentifier] = useState("");
  const settingsQuery = useQuery({
    queryKey: ["enterprise-auth-settings", token],
    queryFn: async () => {
      if (!token) {
        throw new Error("Missing admin session");
      }

      return (await api.getEnterpriseAuthSettings(token)).settings;
    },
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }

    setLdapForm({
      ...settingsQuery.data.providers.ldap.config,
      bindPassword: "",
      clearBindPassword: false,
    });
    setOidcForm({
      ...settingsQuery.data.providers.oidc.config,
      clientSecret: "",
      clearClientSecret: false,
    });
  }, [settingsQuery.data]);

  const saveLdapMutation = useMutation({
    mutationFn: async () => {
      if (!token) {
        throw new Error("Missing admin session");
      }

      return api.updateLdapAuthSettings(ldapForm, token);
    },
    onSuccess: async () => {
      toast.success("LDAP settings saved");
      await queryClient.invalidateQueries({ queryKey: ["enterprise-auth-settings", token] });
      setLdapForm((current) => ({ ...current, bindPassword: "", clearBindPassword: false }));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to save LDAP settings");
    },
  });

  const testLdapMutation = useMutation({
    mutationFn: async () => {
      if (!token) {
        throw new Error("Missing admin session");
      }

      return api.testLdapAuthSettings({ testIdentifier: ldapTestIdentifier || undefined }, token);
    },
    onSuccess: (response) => {
      toast.success(response.result.identity?.username
        ? `LDAP ok: ${response.result.identity.username}`
        : response.result.message);
      void queryClient.invalidateQueries({ queryKey: ["enterprise-auth-settings", token] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to test LDAP settings");
    },
  });

  const saveOidcMutation = useMutation({
    mutationFn: async () => {
      if (!token) {
        throw new Error("Missing admin session");
      }

      return api.updateOidcAuthSettings(oidcForm, token);
    },
    onSuccess: async () => {
      toast.success("OIDC settings saved");
      await queryClient.invalidateQueries({ queryKey: ["enterprise-auth-settings", token] });
      setOidcForm((current) => ({ ...current, clientSecret: "", clearClientSecret: false }));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to save OIDC settings");
    },
  });

  const testOidcMutation = useMutation({
    mutationFn: async () => {
      if (!token) {
        throw new Error("Missing admin session");
      }

      return api.testOidcAuthSettings(token);
    },
    onSuccess: (response) => {
      toast.success(`OIDC discovery ok: ${response.result.issuer}`);
      void queryClient.invalidateQueries({ queryKey: ["enterprise-auth-settings", token] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to test OIDC settings");
    },
  });

  const callbackUrl = useMemo(
    () => `${API_BASE_URL.replace(/\/$/, "")}/auth/oidc/callback`,
    [],
  );

  const ldapSettings = settingsQuery.data?.providers.ldap;
  const oidcSettings = settingsQuery.data?.providers.oidc;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Enterprise authentication"
        description="Configure LDAP and OIDC providers as real TV-Dash login paths without giving up local admin recovery access."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <StatusCard
          title="Local"
          description="Break-glass admin fallback"
          enabled={settingsQuery.data?.local.enabled ?? true}
          detail={settingsQuery.data?.local.loginLabel ?? "Email and password"}
        />
        <StatusCard
          title="LDAP"
          description={ldapSettings?.name ?? "Enterprise LDAP"}
          enabled={ldapSettings?.isEnabled ?? false}
          detail={ldapSettings?.lastValidationMessage ?? "Not validated yet"}
        />
        <StatusCard
          title="OIDC"
          description={oidcSettings?.name ?? "Enterprise SSO"}
          enabled={oidcSettings?.isEnabled ?? false}
          detail={oidcSettings?.lastValidationMessage ?? "Not validated yet"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">LDAP</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Directory authentication</h2>
              <p className="mt-2 text-sm text-slate-400">
                TV-Dash binds to your LDAP service, looks up the user, then authenticates against the resolved DN.
              </p>
            </div>
            <SecretState hasSecret={ldapSettings?.hasBindPassword ?? false} label="Bind secret" />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Provider name">
              <Input value={ldapForm.name} onChange={(event) => setLdapForm((current) => ({ ...current, name: event.target.value }))} />
            </Field>
            <Field label="Login button label">
              <Input value={ldapForm.loginLabel} onChange={(event) => setLdapForm((current) => ({ ...current, loginLabel: event.target.value }))} />
            </Field>
            <Field label="Identifier label">
              <Input value={ldapForm.identifierLabel} onChange={(event) => setLdapForm((current) => ({ ...current, identifierLabel: event.target.value }))} />
            </Field>
            <Field label="Identifier placeholder">
              <Input value={ldapForm.identifierPlaceholder} onChange={(event) => setLdapForm((current) => ({ ...current, identifierPlaceholder: event.target.value }))} />
            </Field>
            <Field className="md:col-span-2" label="LDAP server URL">
              <Input value={ldapForm.serverUrl} onChange={(event) => setLdapForm((current) => ({ ...current, serverUrl: event.target.value }))} />
            </Field>
            <Field className="md:col-span-2" label="Bind DN">
              <Input value={ldapForm.bindDn ?? ""} onChange={(event) => setLdapForm((current) => ({ ...current, bindDn: event.target.value || null }))} />
            </Field>
            <Field className="md:col-span-2" label="Bind password">
              <Input
                type="password"
                placeholder={ldapSettings?.hasBindPassword ? "Stored secret present" : ""}
                value={ldapForm.bindPassword ?? ""}
                onChange={(event) => setLdapForm((current) => ({ ...current, bindPassword: event.target.value, clearBindPassword: false }))}
              />
            </Field>
            <Field className="md:col-span-2" label="User search base DN">
              <Input value={ldapForm.userSearchBaseDn} onChange={(event) => setLdapForm((current) => ({ ...current, userSearchBaseDn: event.target.value }))} />
            </Field>
            <Field className="md:col-span-2" label="User search filter">
              <TextArea rows={4} value={ldapForm.userSearchFilter} onChange={(event) => setLdapForm((current) => ({ ...current, userSearchFilter: event.target.value }))} />
            </Field>
            <Field label="Search scope">
              <Select value={ldapForm.userSearchScope} onChange={(event) => setLdapForm((current) => ({ ...current, userSearchScope: event.target.value as LdapProviderConfigInput["userSearchScope"] }))}>
                <option value="sub">Subtree</option>
                <option value="one">One level</option>
                <option value="base">Base</option>
              </Select>
            </Field>
            <Field label="Default role">
              <Select value={ldapForm.defaultRole} onChange={(event) => setLdapForm((current) => ({ ...current, defaultRole: event.target.value as LdapProviderConfigInput["defaultRole"] }))}>
                <option value="USER">Operator</option>
                <option value="ADMIN">Administrator</option>
              </Select>
            </Field>
            <Field label="Username attribute">
              <Input value={ldapForm.usernameAttribute} onChange={(event) => setLdapForm((current) => ({ ...current, usernameAttribute: event.target.value }))} />
            </Field>
            <Field label="Email attribute">
              <Input value={ldapForm.emailAttribute} onChange={(event) => setLdapForm((current) => ({ ...current, emailAttribute: event.target.value }))} />
            </Field>
            <Field label="Display name attribute">
              <Input value={ldapForm.displayNameAttribute} onChange={(event) => setLdapForm((current) => ({ ...current, displayNameAttribute: event.target.value }))} />
            </Field>
            <Field label="Group attribute">
              <Input value={ldapForm.groupAttribute ?? ""} onChange={(event) => setLdapForm((current) => ({ ...current, groupAttribute: event.target.value || null }))} />
            </Field>
            <Field label="Operation timeout (ms)">
              <Input type="number" value={ldapForm.timeoutMs} onChange={(event) => setLdapForm((current) => ({ ...current, timeoutMs: Number(event.target.value) }))} />
            </Field>
            <Field label="Connect timeout (ms)">
              <Input type="number" value={ldapForm.connectTimeoutMs} onChange={(event) => setLdapForm((current) => ({ ...current, connectTimeoutMs: Number(event.target.value) }))} />
            </Field>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <Toggle label="Enable LDAP login" checked={ldapForm.isEnabled} onChange={(checked) => setLdapForm((current) => ({ ...current, isEnabled: checked }))} />
            <Toggle label="Show on login page" checked={ldapForm.isVisibleOnLogin} onChange={(checked) => setLdapForm((current) => ({ ...current, isVisibleOnLogin: checked }))} />
            <Toggle label="Allow first-login provisioning" checked={ldapForm.allowAutoProvision} onChange={(checked) => setLdapForm((current) => ({ ...current, allowAutoProvision: checked }))} />
            <Toggle label="Auto-link by email" checked={ldapForm.autoLinkByEmail} onChange={(checked) => setLdapForm((current) => ({ ...current, autoLinkByEmail: checked }))} />
            <Toggle label="Auto-link by username" checked={ldapForm.autoLinkByUsername} onChange={(checked) => setLdapForm((current) => ({ ...current, autoLinkByUsername: checked }))} />
            <Toggle label="StartTLS after connect" checked={ldapForm.startTls} onChange={(checked) => setLdapForm((current) => ({ ...current, startTls: checked }))} />
            <Toggle label="Reject invalid TLS certificates" checked={ldapForm.rejectUnauthorized} onChange={(checked) => setLdapForm((current) => ({ ...current, rejectUnauthorized: checked }))} />
            <Toggle label="Clear stored bind password on save" checked={ldapForm.clearBindPassword} onChange={(checked) => setLdapForm((current) => ({ ...current, clearBindPassword: checked, bindPassword: checked ? "" : current.bindPassword }))} />
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-slate-800/80 pt-5">
            <Field label="Optional test identifier">
              <Input value={ldapTestIdentifier} onChange={(event) => setLdapTestIdentifier(event.target.value)} placeholder="jane.doe" />
            </Field>
            <div className="flex gap-3">
              <Button onClick={() => saveLdapMutation.mutate()} type="button">
                Save LDAP settings
              </Button>
              <Button onClick={() => testLdapMutation.mutate()} type="button" variant="secondary">
                Test LDAP
              </Button>
            </div>
          </div>
        </Panel>

        <Panel>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">OIDC</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Single sign-on</h2>
              <p className="mt-2 text-sm text-slate-400">
                TV-Dash uses discovery, PKCE, and token validation for real OIDC login flows. Keycloak works as a first-class target.
              </p>
            </div>
            <SecretState hasSecret={oidcSettings?.hasClientSecret ?? false} label="Client secret" />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Provider name">
              <Input value={oidcForm.name} onChange={(event) => setOidcForm((current) => ({ ...current, name: event.target.value }))} />
            </Field>
            <Field label="Login button label">
              <Input value={oidcForm.loginLabel} onChange={(event) => setOidcForm((current) => ({ ...current, loginLabel: event.target.value }))} />
            </Field>
            <Field className="md:col-span-2" label="Issuer URL">
              <Input value={oidcForm.issuerUrl} onChange={(event) => setOidcForm((current) => ({ ...current, issuerUrl: event.target.value }))} />
            </Field>
            <Field label="Client ID">
              <Input value={oidcForm.clientId} onChange={(event) => setOidcForm((current) => ({ ...current, clientId: event.target.value }))} />
            </Field>
            <Field label="Default role">
              <Select value={oidcForm.defaultRole} onChange={(event) => setOidcForm((current) => ({ ...current, defaultRole: event.target.value as OidcProviderConfigInput["defaultRole"] }))}>
                <option value="USER">Operator</option>
                <option value="ADMIN">Administrator</option>
              </Select>
            </Field>
            <Field className="md:col-span-2" label="Client secret">
              <Input
                type="password"
                placeholder={oidcSettings?.hasClientSecret ? "Stored secret present" : ""}
                value={oidcForm.clientSecret ?? ""}
                onChange={(event) => setOidcForm((current) => ({ ...current, clientSecret: event.target.value, clearClientSecret: false }))}
              />
            </Field>
            <Field className="md:col-span-2" label="Scopes">
              <Input value={oidcForm.scopes} onChange={(event) => setOidcForm((current) => ({ ...current, scopes: event.target.value }))} />
            </Field>
            <Field label="Username claim">
              <Input value={oidcForm.usernameClaim} onChange={(event) => setOidcForm((current) => ({ ...current, usernameClaim: event.target.value }))} />
            </Field>
            <Field label="Email claim">
              <Input value={oidcForm.emailClaim} onChange={(event) => setOidcForm((current) => ({ ...current, emailClaim: event.target.value }))} />
            </Field>
            <Field label="Display name claim">
              <Input value={oidcForm.displayNameClaim} onChange={(event) => setOidcForm((current) => ({ ...current, displayNameClaim: event.target.value }))} />
            </Field>
            <Field label="Groups claim">
              <Input value={oidcForm.groupsClaim ?? ""} onChange={(event) => setOidcForm((current) => ({ ...current, groupsClaim: event.target.value || null }))} />
            </Field>
            <Field className="md:col-span-2" label="Frontend logout path">
              <Input value={oidcForm.postLogoutRedirectPath} onChange={(event) => setOidcForm((current) => ({ ...current, postLogoutRedirectPath: event.target.value }))} />
            </Field>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <Toggle label="Enable OIDC login" checked={oidcForm.isEnabled} onChange={(checked) => setOidcForm((current) => ({ ...current, isEnabled: checked }))} />
            <Toggle label="Show on login page" checked={oidcForm.isVisibleOnLogin} onChange={(checked) => setOidcForm((current) => ({ ...current, isVisibleOnLogin: checked }))} />
            <Toggle label="Allow first-login provisioning" checked={oidcForm.allowAutoProvision} onChange={(checked) => setOidcForm((current) => ({ ...current, allowAutoProvision: checked }))} />
            <Toggle label="Auto-link by email" checked={oidcForm.autoLinkByEmail} onChange={(checked) => setOidcForm((current) => ({ ...current, autoLinkByEmail: checked }))} />
            <Toggle label="Auto-link by username" checked={oidcForm.autoLinkByUsername} onChange={(checked) => setOidcForm((current) => ({ ...current, autoLinkByUsername: checked }))} />
            <Toggle label="Require verified email" checked={oidcForm.requireVerifiedEmail} onChange={(checked) => setOidcForm((current) => ({ ...current, requireVerifiedEmail: checked }))} />
            <Toggle label="Clear stored client secret on save" checked={oidcForm.clearClientSecret} onChange={(checked) => setOidcForm((current) => ({ ...current, clearClientSecret: checked, clientSecret: checked ? "" : current.clientSecret }))} />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-800/80 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
            OIDC callback URL: <span className="font-mono text-cyan-200">{callbackUrl}</span>
          </div>

          <div className="mt-5 flex gap-3">
            <Button onClick={() => saveOidcMutation.mutate()} type="button">
              Save OIDC settings
            </Button>
            <Button onClick={() => testOidcMutation.mutate()} type="button" variant="secondary">
              Test discovery
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function StatusCard({
  title,
  description,
  enabled,
  detail,
}: {
  title: string;
  description: string;
  enabled: boolean;
  detail: string;
}) {
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">{title}</p>
          <h2 className="mt-2 text-lg font-semibold text-white">{description}</h2>
        </div>
        <span className={enabled
          ? "rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200"
          : "rounded-full border border-slate-700/80 bg-slate-900/80 px-3 py-1 text-xs font-semibold text-slate-300"}>
          {enabled ? "Enabled" : "Disabled"}
        </span>
      </div>
      <p className="mt-3 text-sm text-slate-400">{detail}</p>
    </Panel>
  );
}

function SecretState({ hasSecret, label }: { hasSecret: boolean; label: string }) {
  return (
    <span className={hasSecret
      ? "rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200"
      : "rounded-full border border-slate-700/80 bg-slate-900/80 px-3 py-1 text-xs font-semibold text-slate-300"}>
      {label}: {hasSecret ? "Stored" : "Not set"}
    </span>
  );
}

function Field({
  label,
  children,
  className,
}: PropsWithChildren<{ label: string; className?: string }>) {
  return (
    <div className={className}>
      <label className="mb-2 block text-sm text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-2xl border border-slate-800/80 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
      <input checked={checked} className="h-4 w-4 rounded border-slate-600 bg-slate-900" onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}
