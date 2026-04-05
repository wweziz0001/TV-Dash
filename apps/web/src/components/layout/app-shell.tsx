import {
  ActivitySquare,
  BarChart3,
  BellRing,
  Clapperboard,
  Film,
  Grid2x2,
  KeyRound,
  LayoutDashboard,
  LogOut,
  RadioTower,
  ShieldCheck,
  Star,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/features/auth/auth-context";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import { roleHasPermission } from "@tv-dash/shared";

const primaryNav = [
  { to: "/", label: "Channels", icon: Clapperboard, end: true },
  { to: "/multiview", label: "Multi-View", icon: Grid2x2 },
  { to: "/recordings", label: "Recordings", icon: Film },
];

const adminNav = [
  { to: "/admin/alerts", label: "Alerts", icon: BellRing },
  { to: "/admin/observability", label: "Observability", icon: ActivitySquare },
  { to: "/admin/auth", label: "Enterprise Auth", icon: KeyRound },
  { to: "/admin/channels", label: "Admin Channels", icon: LayoutDashboard },
  { to: "/admin/groups", label: "Admin Groups", icon: ShieldCheck },
  { to: "/admin/epg", label: "Admin EPG", icon: RadioTower },
];

export function AppShell() {
  const { logout, token, user } = useAuth();
  const alertSummaryQuery = useQuery({
    queryKey: ["admin-alert-summary", token],
    queryFn: async () => {
      if (!token) {
        throw new Error("Missing admin session");
      }

      return (await api.getAlertSummary(token)).summary;
    },
    enabled: Boolean(token && user && roleHasPermission(user.role, "admin:access")),
    refetchInterval: 15_000,
  });

  return (
    <div className="min-h-screen bg-dashboard-grid bg-[size:28px_28px]">
      <div className="mx-auto flex min-h-screen w-full max-w-[2800px] flex-col gap-3 px-3 py-3 lg:flex-row lg:gap-4 lg:px-4">
        <aside className="w-full rounded-[1.5rem] border border-slate-800/80 bg-slate-950/72 p-3 shadow-glow backdrop-blur lg:sticky lg:top-3 lg:h-[calc(100vh-1.5rem)] lg:w-64 lg:flex-none xl:w-72">
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3 lg:block">
              <div className="min-w-0 flex-1 rounded-[1.25rem] border border-slate-800/80 bg-gradient-to-br from-cyan-400/10 via-slate-900 to-amber-400/10 p-3 sm:p-4">
                <p className="text-[11px] uppercase tracking-[0.28em] text-accent/80">TV-Dash</p>
                <h1 className="mt-2 text-lg font-bold text-white sm:text-xl">IPTV operations, tuned for real usage.</h1>
                <p className="mt-2 text-[13px] leading-5 text-slate-400">
                  Watch, manage, and compose channel layouts from one control surface.
                </p>
              </div>

              <button
                className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-700/70 bg-slate-950/70 px-3 text-[13px] font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-900 lg:hidden"
                onClick={() => {
                  void logout();
                }}
                type="button"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>

            <nav className="flex gap-2 overflow-x-auto pb-1 lg:mt-5 lg:block lg:space-y-1.5 lg:overflow-visible lg:pb-0">
              {primaryNav.map((item) => (
                <NavItem key={item.to} to={item.to} label={item.label} icon={item.icon} end={item.end} />
              ))}
            </nav>

            {user && roleHasPermission(user.role, "admin:access") ? (
              <div className="lg:mt-6">
                <p className="px-1 text-[11px] uppercase tracking-[0.24em] text-slate-500 lg:px-2">Admin</p>
                <nav className="mt-2 flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1.5 lg:overflow-visible lg:pb-0">
                  {adminNav.map((item) => (
                    <NavItem
                      badge={item.to === "/admin/alerts"
                        ? alertSummaryQuery.data?.newCount
                          ? String(alertSummaryQuery.data.newCount)
                          : alertSummaryQuery.data?.activeCount
                            ? String(alertSummaryQuery.data.activeCount)
                            : null
                        : null}
                      key={item.to}
                      to={item.to}
                      label={item.label}
                      icon={item.icon}
                    />
                  ))}
                </nav>
              </div>
            ) : null}

            <div className="rounded-[1.25rem] border border-slate-800/70 bg-slate-900/70 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">{user?.username}</p>
                  <p className="text-[13px] text-slate-400">{user?.role === "ADMIN" ? "Administrator" : "Operator"}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-950/70 px-3 py-2 text-[11px] text-slate-400">
                <Star className="h-3.5 w-3.5 text-amber-300" />
                Favorites and saved walls stay per-user.
              </div>
              <button
                className="mt-3 hidden h-9 w-full items-center justify-center gap-2 rounded-xl border border-slate-700/70 bg-slate-950/70 px-3 text-[13px] font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-900 lg:flex"
                onClick={() => {
                  void logout();
                }}
                type="button"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  end,
  badge,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  badge?: string | null;
}) {
  return (
    <NavLink
      end={end}
      to={to}
      className={({ isActive }) =>
        cn(
          "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium text-slate-400 transition hover:bg-slate-900/70 hover:text-white",
          isActive && "border border-slate-700/70 bg-slate-900 text-white shadow-[0_0_0_1px_rgba(110,231,249,0.15)]",
        )
      }
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      {badge ? (
        <span className="ml-auto rounded-full border border-cyan-400/30 bg-cyan-500/15 px-2 py-0.5 text-[11px] font-semibold text-cyan-100">
          {badge}
        </span>
      ) : null}
    </NavLink>
  );
}
