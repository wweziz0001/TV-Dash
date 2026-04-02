import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { RequireAdmin, RequireAuth } from "@/features/auth/auth-context";
import { AdminChannelsPage } from "@/pages/admin-channels-page";
import { AdminGroupsPage } from "@/pages/admin-groups-page";
import { ChannelWatchPage } from "@/pages/channel-watch-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { LoginPage } from "@/pages/login-page";
import { MultiViewPage } from "@/pages/multiview-page";
import { NotFoundPage } from "@/pages/not-found-page";
export function AppRouter() {
    return (_jsx(BrowserRouter, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsxs(Route, { path: "/", element: _jsx(RequireAuth, { children: _jsx(AppShell, {}) }), children: [_jsx(Route, { index: true, element: _jsx(DashboardPage, {}) }), _jsx(Route, { path: "watch/:slug", element: _jsx(ChannelWatchPage, {}) }), _jsx(Route, { path: "multiview", element: _jsx(MultiViewPage, {}) }), _jsx(Route, { path: "admin/channels", element: _jsx(RequireAdmin, { children: _jsx(AdminChannelsPage, {}) }) }), _jsx(Route, { path: "admin/groups", element: _jsx(RequireAdmin, { children: _jsx(AdminGroupsPage, {}) }) })] }), _jsx(Route, { path: "*", element: _jsx(NotFoundPage, {}) }), _jsx(Route, { path: "/home", element: _jsx(Navigate, { to: "/", replace: true }) })] }) }));
}
