import { BarChart3, Clapperboard, Grid2x2, LayoutDashboard, LogOut, ShieldCheck, Star } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/features/auth/auth-context";
import { cn } from "@/lib/utils";

const primaryNav = [
  { to: "/", label: "Channels", icon: Clapperboard, end: true },
  { to: "/multiview", label: "Multi-View", icon: Grid2x2 },
];

const adminNav = [
  { to: "/admin/channels", label: "Admin Channels", icon: LayoutDashboard },
  { to: "/admin/groups", label: "Admin Groups", icon: ShieldCheck },
];

export function AppShell() {
  const { logout, user } = useAuth();

  return (
    <div className="min-h-screen bg-dashboard-grid bg-[size:28px_28px]">
      <div className="mx-auto flex min-h-screen max-w-[1700px] flex-col gap-6 px-4 py-4 lg:flex-row lg:px-6">
        <aside className="w-full rounded-[2rem] border border-slate-800/80 bg-slate-950/70 p-4 shadow-glow backdrop-blur lg:w-80">
          <div className="rounded-[1.75rem] border border-slate-800/80 bg-gradient-to-br from-cyan-400/10 via-slate-900 to-amber-400/10 p-5">
            <p className="text-xs uppercase tracking-[0.32em] text-accent/80">TV-Dash</p>
            <h1 className="mt-3 text-2xl font-bold text-white">IPTV operations, tuned for real usage.</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Watch, manage, and compose channel layouts from one control surface.
            </p>
          </div>

          <nav className="mt-6 space-y-2">
            {primaryNav.map((item) => (
              <NavItem key={item.to} to={item.to} label={item.label} icon={item.icon} end={item.end} />
            ))}
          </nav>

          {user?.role === "ADMIN" ? (
            <div className="mt-8">
              <p className="px-2 text-xs uppercase tracking-[0.28em] text-slate-500">Admin</p>
              <nav className="mt-3 space-y-2">
                {adminNav.map((item) => (
                  <NavItem key={item.to} to={item.to} label={item.label} icon={item.icon} />
                ))}
              </nav>
            </div>
          ) : null}

          <div className="mt-8 rounded-[1.75rem] border border-slate-800/70 bg-slate-900/70 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-white">{user?.username}</p>
                <p className="text-sm text-slate-400">{user?.role === "ADMIN" ? "Administrator" : "Operator"}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-slate-950/70 px-3 py-2 text-xs text-slate-400">
              <Star className="h-4 w-4 text-amber-300" />
              Favorites and saved walls stay per-user.
            </div>
            <button
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-700/70 bg-slate-950/70 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-900"
              onClick={logout}
              type="button"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </aside>

        <main className="flex-1">
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
          "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-slate-400 transition hover:bg-slate-900/70 hover:text-white",
          isActive && "border border-slate-700/70 bg-slate-900 text-white shadow-[0_0_0_1px_rgba(110,231,249,0.15)]",
        )
      }
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </NavLink>
  );
}

