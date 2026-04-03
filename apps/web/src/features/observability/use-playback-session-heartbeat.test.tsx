import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlaybackSessionHeartbeat, type PlaybackSessionDescriptor } from "./use-playback-session-heartbeat";

const { mockHeartbeatPlaybackSessions, mockEndPlaybackSessions } = vi.hoisted(() => ({
  mockHeartbeatPlaybackSessions: vi.fn(),
  mockEndPlaybackSessions: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  api: {
    heartbeatPlaybackSessions: mockHeartbeatPlaybackSessions,
    endPlaybackSessions: mockEndPlaybackSessions,
  },
}));

function HookHarness({
  descriptors,
  token = "token-1",
}: {
  descriptors: PlaybackSessionDescriptor[];
  token?: string | null;
}) {
  usePlaybackSessionHeartbeat(token, descriptors);

  return null;
}

describe("usePlaybackSessionHeartbeat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi
      .spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValue("11111111-1111-1111-1111-111111111111");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sends immediate and interval heartbeats and ends sessions on unmount", async () => {
    const descriptors: PlaybackSessionDescriptor[] = [
      {
        sessionKey: "watch:channel-1",
        channelId: "11111111-1111-1111-1111-111111111111",
        sessionType: "SINGLE_VIEW",
        playbackState: "playing",
        selectedQuality: "AUTO",
        isMuted: false,
        failureKind: null,
      },
    ];

    const view = render(<HookHarness descriptors={descriptors} />);

    expect(mockHeartbeatPlaybackSessions).toHaveBeenCalledWith(
      {
        sessions: [
          expect.objectContaining({
            sessionId: "11111111-1111-1111-1111-111111111111",
            channelId: "11111111-1111-1111-1111-111111111111",
            sessionType: "SINGLE_VIEW",
          }),
        ],
      },
      "token-1",
      false,
    );

    vi.advanceTimersByTime(15_000);

    expect(mockHeartbeatPlaybackSessions).toHaveBeenCalledTimes(2);

    view.unmount();

    expect(mockEndPlaybackSessions).toHaveBeenCalledWith(
      {
        sessionIds: ["11111111-1111-1111-1111-111111111111"],
      },
      "token-1",
      true,
    );
  });

  it("ends removed sessions when the descriptor list shrinks", () => {
    const firstRender: PlaybackSessionDescriptor[] = [
      {
        sessionKey: "multiview:0",
        channelId: "11111111-1111-1111-1111-111111111111",
        sessionType: "MULTIVIEW",
        playbackState: "playing",
        selectedQuality: "LOWEST",
        isMuted: true,
        tileIndex: 0,
        failureKind: null,
      },
    ];

    const view = render(<HookHarness descriptors={firstRender} />);

    view.rerender(<HookHarness descriptors={[]} />);

    expect(mockEndPlaybackSessions).toHaveBeenCalledWith(
      {
        sessionIds: ["11111111-1111-1111-1111-111111111111"],
      },
      "token-1",
      false,
    );
  });
});
