import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { RequireAdmin, RequireAuth } from "@/features/auth/auth-context";
import { AdminChannelsPage } from "@/pages/admin-channels-page";
import { AdminEpgSourcesPage } from "@/pages/admin-epg-sources-page";
import { AdminGroupsPage } from "@/pages/admin-groups-page";
import { ChannelWatchPage } from "@/pages/channel-watch-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { LoginPage } from "@/pages/login-page";
import { MultiViewPage } from "@/pages/multiview-page";
import { NotFoundPage } from "@/pages/not-found-page";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="watch/:slug" element={<ChannelWatchPage />} />
          <Route path="multiview" element={<MultiViewPage />} />
          <Route
            path="admin/channels"
            element={
              <RequireAdmin>
                <AdminChannelsPage />
              </RequireAdmin>
            }
          />
          <Route
            path="admin/groups"
            element={
              <RequireAdmin>
                <AdminGroupsPage />
              </RequireAdmin>
            }
          />
          <Route
            path="admin/epg"
            element={
              <RequireAdmin>
                <AdminEpgSourcesPage />
              </RequireAdmin>
            }
          />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
        <Route path="/home" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
