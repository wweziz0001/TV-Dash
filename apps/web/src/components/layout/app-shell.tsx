import {
  ActivitySquare,
  BarChart3,
  Clapperboard,
  Grid2x2,
  LayoutDashboard,
  LogOut,
  RadioTower,
  ShieldCheck,
  Star,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/features/auth/auth-context";
import { cn } from "@/lib/utils";

const primaryNav = [
  { to: "/", label: "Channels", icon: Clapperboard, end: true },
  { to: "/multiview", label: "Multi-View", icon: Grid2x2 },
];

const adminNav = [
  { to: "/admin/observability", label: "Observability", icon: ActivitySquare },
  { to: "/admin/channels", label: "Admin Channels", icon: LayoutDashboard },
  { to: "/admin/groups", label: "Admin Groups", icon: ShieldCheck },
  { to: "/admin/epg", label: "Admin EPG", icon: RadioTower },
];

export function AppShell() {
  const { logout, user } = useAuth();

  return (
    <div className="min-h-screen bg-dashboard-grid bg-[size:28px_28px]">
      <div className="mx-auto flex min-h-screen w-full max-w-[2048px] flex-col gap-4 px-3 py-3 lg:flex-row lg:px-4">
        <aside className="w-full rounded-[1.5rem] border border-slate-800/80 bg-slate-950/72 p-3 shadow-glow backdrop-blur lg:sticky lg:top-3 lg:h-[calc(100vh-1.5rem)] lg:w-64 lg:flex-none xl:w-72">
          <div className="rounded-[1.25rem] border border-slate-800/80 bg-gradient-to-br from-cyan-400/10 via-slate-900 to-amber-400/10 p-4">
            <p className="text-[11px] uppercase tracking-[0.28em] text-accent/80">TV-Dash</p>
            <h1 className="mt-2 text-xl font-bold text-white">IPTV operations, tuned for real usage.</h1>
            <p className="mt-2 text-[13px] leading-5 text-slate-400">
              Watch, manage, and compose channel layouts from one control surface.
            </p>
          </div>

          <nav className="mt-5 space-y-1.5">
            {primaryNav.map((item) => (
              <NavItem key={item.to} to={item.to} label={item.label} icon={item.icon} end={item.end} />
            ))}
          </nav>

          {user?.role === "ADMIN" ? (
            <div className="mt-6">
              <p className="px-2 text-[11px] uppercase tracking-[0.24em] text-slate-500">Admin</p>
              <nav className="mt-2.5 space-y-1.5">
                {adminNav.map((item) => (
                  <NavItem key={item.to} to={item.to} label={item.label} icon={item.icon} />
                ))}
              </nav>
            </div>
          ) : null}

          <div className="mt-6 rounded-[1.25rem] border border-slate-800/70 bg-slate-900/70 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <BarChart3 className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-white">{user?.username}</p>
                <p className="text-[13px] text-slate-400">{user?.role === "ADMIN" ? "Administrator" : "Operator"}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-950/70 px-3 py-2 text-[11px] text-slate-400">
              <Star className="h-3.5 w-3.5 text-amber-300" />
              Favorites and saved walls stay per-user.
            </div>
            <button
              className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-slate-700/70 bg-slate-950/70 px-3 text-[13px] font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-900"
              onClick={logout}
              type="button"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
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
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}) {
  return (
    <NavLink
      end={end}
      to={to}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium text-slate-400 transition hover:bg-slate-900/70 hover:text-white",
          isActive && "border border-slate-700/70 bg-slate-900 text-white shadow-[0_0_0_1px_rgba(110,231,249,0.15)]",
        )
      }
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </NavLink>
  );
}
