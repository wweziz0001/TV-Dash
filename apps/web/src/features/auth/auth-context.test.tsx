import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenPage } from "@/pages/forbidden-page";
import { LoginPage } from "@/pages/login-page";
import { AuthProvider, RequireAdmin, RequireAuth } from "./auth-context";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    me: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock("@/services/api", () => ({
  AUTH_EXPIRED_EVENT: "tv-dash:auth-expired",
  api: apiMock,
}));

vi.mock("react-hot-toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function renderWithAuth(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AuthProvider>
          <Routes>
            <Route
              path="/protected"
              element={
                <RequireAuth>
                  <div>Protected screen</div>
                </RequireAuth>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <div>Admin screen</div>
                </RequireAdmin>
              }
            />
            <Route path="/forbidden" element={<ForbiddenPage />} />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("auth-context protection", () => {
  beforeEach(() => {
    apiMock.me.mockReset();
    apiMock.login.mockReset();
    apiMock.logout.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("redirects non-admin users away from admin-only routes", async () => {
    window.localStorage.setItem("tv-dash-token", "token");
    apiMock.me.mockResolvedValue({
      user: {
        id: "11111111-1111-1111-1111-111111111111",
        email: "ops@example.com",
        username: "ops-user",
        role: "USER",
      },
    });

    renderWithAuth("/admin");

    await waitFor(() => {
      expect(screen.getByText("Admin access is required")).toBeInTheDocument();
    });
    expect(screen.getByText("Requested path: /admin")).toBeInTheDocument();
  });

  it("clears stale sessions and sends the user back to login", async () => {
    window.localStorage.setItem("tv-dash-token", "token");
    apiMock.me.mockRejectedValue(new Error("Unauthorized"));

    renderWithAuth("/protected");

    await waitFor(() => {
      expect(screen.getByText("Enter the control room")).toBeInTheDocument();
    });
    expect(screen.getByText("Your session expired or was revoked. Sign in again.")).toBeInTheDocument();
    expect(window.localStorage.getItem("tv-dash-token")).toBeNull();
  });
});
