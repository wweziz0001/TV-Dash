import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCountOperationalAlerts = vi.fn();
const mockCreateOperationalAlert = vi.fn();
const mockFindActiveOperationalAlertByDedupeKey = vi.fn();
const mockFindOperationalAlertById = vi.fn();
const mockListOperationalAlerts = vi.fn();
const mockUpdateOperationalAlert = vi.fn();

vi.mock("./alert.repository.js", () => ({
  countOperationalAlerts: mockCountOperationalAlerts,
  createOperationalAlert: mockCreateOperationalAlert,
  findActiveOperationalAlertByDedupeKey: mockFindActiveOperationalAlertByDedupeKey,
  findOperationalAlertById: mockFindOperationalAlertById,
  listOperationalAlerts: mockListOperationalAlerts,
  updateOperationalAlert: mockUpdateOperationalAlert,
}));

const {
  acknowledgeOperationalAlert,
  createOrUpdateActiveOperationalAlert,
  listOperationalAlerts,
  resolveOperationalAlertByDedupeKey,
} = await import("./alert.service.js");

function buildAlertRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "alert-1",
    type: "CHANNEL_STREAM_DOWN",
    category: "CHANNEL_HEALTH",
    severity: "CRITICAL",
    status: "NEW",
    sourceSubsystem: "streams.proxy",
    title: "Ops Channel stream unavailable",
    message: "TV-Dash failed to fetch the playback master repeatedly.",
    isActive: true,
    dedupeKey: "channel-stream:1:proxyMaster",
    occurrenceCount: 1,
    relatedEntityType: "CHANNEL",
    relatedEntityId: "channel-1",
    metadataJson: {
      channelName: "Ops Channel",
      channelSlug: "ops-channel",
    },
    firstOccurredAt: new Date("2026-04-05T13:00:00.000Z"),
    lastOccurredAt: new Date("2026-04-05T13:05:00.000Z"),
    acknowledgedAt: null,
    acknowledgedByUserId: null,
    resolvedAt: null,
    resolvedByUserId: null,
    dismissedAt: null,
    dismissedByUserId: null,
    createdAt: new Date("2026-04-05T13:00:00.000Z"),
    updatedAt: new Date("2026-04-05T13:05:00.000Z"),
    ...overrides,
  };
}

describe("alert.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new active alert when no deduped alert exists", async () => {
    mockFindActiveOperationalAlertByDedupeKey.mockResolvedValue(null);
    mockCreateOperationalAlert.mockResolvedValue(buildAlertRecord());

    const result = await createOrUpdateActiveOperationalAlert({
      dedupeKey: "channel-stream:1:proxyMaster",
      type: "CHANNEL_STREAM_DOWN",
      category: "CHANNEL_HEALTH",
      severity: "CRITICAL",
      sourceSubsystem: "streams.proxy",
      title: "Ops Channel stream unavailable",
      message: "TV-Dash failed to fetch the playback master repeatedly.",
      relatedEntityType: "CHANNEL",
      relatedEntityId: "channel-1",
      metadata: {
        channelName: "Ops Channel",
        channelSlug: "ops-channel",
      },
    });

    expect(mockCreateOperationalAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: "channel-stream:1:proxyMaster",
        isActive: true,
        status: "NEW",
        occurrenceCount: 1,
      }),
    );
    expect(result?.relatedEntityPath).toBe("/watch/ops-channel");
  });

  it("updates the existing active alert occurrence count when the dedupe key matches", async () => {
    mockFindActiveOperationalAlertByDedupeKey.mockResolvedValue(buildAlertRecord());
    mockUpdateOperationalAlert.mockResolvedValue(buildAlertRecord({ occurrenceCount: 2 }));

    const result = await createOrUpdateActiveOperationalAlert({
      dedupeKey: "channel-stream:1:proxyMaster",
      type: "CHANNEL_STREAM_DOWN",
      category: "CHANNEL_HEALTH",
      severity: "CRITICAL",
      sourceSubsystem: "streams.proxy",
      title: "Ops Channel stream unavailable",
      message: "TV-Dash failed to fetch the playback master repeatedly.",
    });

    expect(mockUpdateOperationalAlert).toHaveBeenCalledWith(
      "alert-1",
      expect.objectContaining({
        occurrenceCount: {
          increment: 1,
        },
      }),
    );
    expect(result?.occurrenceCount).toBe(2);
  });

  it("resolves the active alert and emits a recovery notification", async () => {
    mockFindActiveOperationalAlertByDedupeKey.mockResolvedValue(buildAlertRecord());
    mockUpdateOperationalAlert.mockResolvedValueOnce(
      buildAlertRecord({
        status: "RESOLVED",
        isActive: false,
        resolvedAt: new Date("2026-04-05T13:10:00.000Z"),
      }),
    );
    mockCreateOperationalAlert.mockResolvedValueOnce(
      buildAlertRecord({
        id: "alert-2",
        type: "CHANNEL_STREAM_RECOVERED",
        severity: "SUCCESS",
        status: "NEW",
        isActive: false,
        dedupeKey: null,
      }),
    );

    const result = await resolveOperationalAlertByDedupeKey({
      dedupeKey: "channel-stream:1:proxyMaster",
      resolutionNotification: {
        type: "CHANNEL_STREAM_RECOVERED",
        category: "CHANNEL_HEALTH",
        severity: "SUCCESS",
        sourceSubsystem: "streams.proxy",
        title: "Ops Channel stream recovered",
        message: "TV-Dash can serve the playback master again.",
        relatedEntityType: "CHANNEL",
        relatedEntityId: "channel-1",
        metadata: {
          channelName: "Ops Channel",
          channelSlug: "ops-channel",
        },
      },
    });

    expect(mockUpdateOperationalAlert).toHaveBeenCalledWith(
      "alert-1",
      expect.objectContaining({
        status: "RESOLVED",
        isActive: false,
      }),
    );
    expect(mockCreateOperationalAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CHANNEL_STREAM_RECOVERED",
        isActive: false,
        status: "NEW",
      }),
    );
    expect(result.resolvedAlert?.status).toBe("RESOLVED");
    expect(result.resolutionNotification?.type).toBe("CHANNEL_STREAM_RECOVERED");
  });

  it("maps related links for listed alerts", async () => {
    mockListOperationalAlerts.mockResolvedValue([
      buildAlertRecord({
        relatedEntityType: "RECORDING_JOB",
        relatedEntityId: "recording-1",
        metadataJson: {
          recordingTitle: "Morning bulletin",
        },
      }),
    ]);

    const result = await listOperationalAlerts({ view: "ALL" });

    expect(result).toEqual([
      expect.objectContaining({
        relatedEntityLabel: "Morning bulletin",
        relatedEntityPath: "/recordings/recording-1",
      }),
    ]);
  });

  it("acknowledges an active alert without changing its link metadata", async () => {
    mockFindOperationalAlertById.mockResolvedValue(buildAlertRecord());
    mockUpdateOperationalAlert.mockResolvedValue(
      buildAlertRecord({
        status: "ACKNOWLEDGED",
        acknowledgedAt: new Date("2026-04-05T13:07:00.000Z"),
        acknowledgedByUserId: "user-1",
      }),
    );

    const result = await acknowledgeOperationalAlert("alert-1", "user-1");

    expect(mockUpdateOperationalAlert).toHaveBeenCalledWith(
      "alert-1",
      expect.objectContaining({
        status: "ACKNOWLEDGED",
        acknowledgedByUserId: "user-1",
      }),
    );
    expect(result?.status).toBe("ACKNOWLEDGED");
    expect(result?.relatedEntityPath).toBe("/watch/ops-channel");
  });
});
