import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  user: {
    findUnique: vi.fn(),
  },
};

const mockAcknowledgeOperationalAlert = vi.fn();
const mockDismissOperationalAlert = vi.fn();
const mockGetOperationalAlertSummary = vi.fn();
const mockListOperationalAlerts = vi.fn();
const mockResolveOperationalAlert = vi.fn();
const mockRecordAuditEvent = vi.fn();

vi.mock("../../db/prisma.js", () => ({
  prisma: mockPrisma,
}));

vi.mock("./alert.service.js", () => ({
  acknowledgeOperationalAlert: mockAcknowledgeOperationalAlert,
  dismissOperationalAlert: mockDismissOperationalAlert,
  getOperationalAlertSummary: mockGetOperationalAlertSummary,
  listOperationalAlerts: mockListOperationalAlerts,
  resolveOperationalAlert: mockResolveOperationalAlert,
}));

vi.mock("../audit/audit.service.js", () => ({
  recordAuditEvent: mockRecordAuditEvent,
}));

const { buildServer } = await import("../../app/build-server.js");
const { createAuthHeaders } = await import("../../app/test-support.js");

function buildAlert(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

describe("alertRoutes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockImplementation(({ where }: { where?: { id?: string } }) =>
      Promise.resolve(
        where?.id === "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
          ? {
              id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
              email: "admin@example.com",
              username: "admin",
              role: "ADMIN",
              sessionVersion: 0,
              createdAt: new Date("2026-04-03T00:00:00.000Z"),
              updatedAt: new Date("2026-04-03T00:00:00.000Z"),
            }
          : null,
      ),
    );
    mockGetOperationalAlertSummary.mockResolvedValue({
      generatedAt: "2026-04-05T13:05:00.000Z",
      totalCount: 4,
      newCount: 2,
      activeCount: 1,
      acknowledgedCount: 1,
      criticalCount: 1,
      errorCount: 1,
      resolvedCount: 1,
      dismissedCount: 1,
    });
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("lists alerts plus summary for admins", async () => {
    mockListOperationalAlerts.mockResolvedValue([buildAlert()]);

    const response = await server.inject({
      method: "GET",
      url: "/api/alerts?view=ACTIVE&limit=10",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
    });

    expect(response.statusCode).toBe(200);
    expect(mockListOperationalAlerts).toHaveBeenCalledWith({
      view: "ACTIVE",
      statuses: [],
      categories: [],
      severities: [],
      sourceSubsystem: undefined,
      search: undefined,
      limit: 10,
    });
    expect(response.json()).toEqual({
      alerts: [buildAlert()],
      summary: expect.objectContaining({
        newCount: 2,
        activeCount: 1,
      }),
    });
  });

  it("acknowledges an alert and records an audit event", async () => {
    mockAcknowledgeOperationalAlert.mockResolvedValue(buildAlert({ status: "ACKNOWLEDGED" }));

    const response = await server.inject({
      method: "POST",
      url: "/api/alerts/11111111-1111-1111-1111-111111111111/acknowledge",
      headers: createAuthHeaders(server, { role: "ADMIN" }),
    });

    expect(response.statusCode).toBe(200);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "alert.acknowledge",
        targetType: "OperationalAlert",
      }),
    );
    expect(response.json()).toEqual({
      alert: buildAlert({ status: "ACKNOWLEDGED" }),
    });
  });

  it("rejects alert access for non-admin users", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      email: "ops@example.com",
      username: "ops-user",
      role: "USER",
      sessionVersion: 0,
      createdAt: new Date("2026-04-03T00:00:00.000Z"),
      updatedAt: new Date("2026-04-03T00:00:00.000Z"),
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/alerts",
      headers: createAuthHeaders(server, { role: "USER" }),
    });

    expect(response.statusCode).toBe(403);
  });
});
