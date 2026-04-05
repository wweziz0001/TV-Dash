import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { RequireAdmin, RequireAuth } from "@/features/auth/auth-context";
import { AdminAlertsPage } from "@/pages/admin-alerts-page";
import { AdminAuthPage } from "@/pages/admin-auth-page";
import { AdminChannelsPage } from "@/pages/admin-channels-page";
import { AdminEpgSourcesPage } from "@/pages/admin-epg-sources-page";
import { AdminGroupsPage } from "@/pages/admin-groups-page";
import { AdminObservabilityPage } from "@/pages/admin-observability-page";
import { ChannelWatchPage } from "@/pages/channel-watch-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { ForbiddenPage } from "@/pages/forbidden-page";
import { LoginPage } from "@/pages/login-page";
import { MultiViewPage } from "@/pages/multiview-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { OidcCallbackPage } from "@/pages/oidc-callback-page";
import { RecordingPlaybackPage } from "@/pages/recording-playback-page";
import { RecordingsPage } from "@/pages/recordings-page";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/oidc/callback" element={<OidcCallbackPage />} />
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
          <Route path="recordings" element={<RecordingsPage />} />
          <Route path="recordings/:id" element={<RecordingPlaybackPage />} />
          <Route path="forbidden" element={<ForbiddenPage />} />
          <Route
            path="admin/alerts"
            element={
              <RequireAdmin>
                <AdminAlertsPage />
              </RequireAdmin>
            }
          />
          <Route
            path="admin/auth"
            element={
              <RequireAdmin>
                <AdminAuthPage />
              </RequireAdmin>
            }
          />
          <Route
            path="admin/observability"
            element={
              <RequireAdmin>
                <AdminObservabilityPage />
              </RequireAdmin>
            }
          />
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
