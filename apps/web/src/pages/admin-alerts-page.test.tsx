import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AdminAlertsPage } from "./admin-alerts-page";

const {
  mockListAlerts,
  mockAcknowledgeAlert,
  mockResolveAlert,
  mockDismissAlert,
} = vi.hoisted(() => ({
  mockListAlerts: vi.fn(),
  mockAcknowledgeAlert: vi.fn(),
  mockResolveAlert: vi.fn(),
  mockDismissAlert: vi.fn(),
}));

vi.mock("@/features/auth/auth-context", () => ({
  useAuth: () => ({
    token: "token-1",
    user: {
      id: "admin-1",
      username: "admin",
      role: "ADMIN",
    },
  }),
}));

vi.mock("@/services/api", async () => {
  const actual = await vi.importActual<typeof import("@/services/api")>("@/services/api");

  return {
    ...actual,
    api: {
      listAlerts: mockListAlerts,
      acknowledgeAlert: mockAcknowledgeAlert,
      resolveAlert: mockResolveAlert,
      dismissAlert: mockDismissAlert,
    },
  };
});

vi.mock("react-hot-toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <AdminAlertsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminAlertsPage", () => {
  it("renders fetched alerts and allows acknowledgement", async () => {
    mockListAlerts.mockResolvedValue({
      summary: {
        generatedAt: "2026-04-05T13:05:00.000Z",
        totalCount: 4,
        newCount: 2,
        activeCount: 1,
        acknowledgedCount: 1,
        criticalCount: 1,
        errorCount: 1,
        resolvedCount: 1,
        dismissedCount: 1,
      },
      alerts: [
        {
          id: "alert-1",
          type: "CHANNEL_STREAM_DOWN",
          category: "CHANNEL_HEALTH",
          severity: "CRITICAL",
          severityLabel: "critical",
          status: "NEW",
          sourceSubsystem: "streams.proxy",
          title: "Ops Channel stream unavailable",
          message: "TV-Dash failed to fetch the playback master repeatedly.",
          isActive: true,
          dedupeKey: "channel-stream:1:proxyMaster",
          occurrenceCount: 2,
          relatedEntityType: "CHANNEL",
          relatedEntityId: "channel-1",
          relatedEntityLabel: "Ops Channel",
          relatedEntityPath: "/watch/ops-channel",
          metadata: {
            channelName: "Ops Channel",
            channelSlug: "ops-channel",
          },
          firstOccurredAt: "2026-04-05T13:00:00.000Z",
          lastOccurredAt: "2026-04-05T13:05:00.000Z",
          acknowledgedAt: null,
          acknowledgedByUserId: null,
          resolvedAt: null,
          resolvedByUserId: null,
          dismissedAt: null,
          dismissedByUserId: null,
          createdAt: "2026-04-05T13:00:00.000Z",
          updatedAt: "2026-04-05T13:05:00.000Z",
        },
      ],
    });
    mockAcknowledgeAlert.mockResolvedValue({});

    renderPage();

    expect(await screen.findByText("Ops Channel stream unavailable")).toBeInTheDocument();
    expect(screen.getByText("TV-Dash failed to fetch the playback master repeatedly.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open ops channel/i })).toHaveAttribute("href", "/watch/ops-channel");

    await userEvent.setup().click(screen.getByRole("button", { name: "Acknowledge" }));

    await waitFor(() => {
      expect(mockAcknowledgeAlert).toHaveBeenCalledWith("alert-1", "token-1");
    });
  });
});
