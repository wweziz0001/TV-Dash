import { useEffect } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FloatingPlayerPage } from "./floating-player-page";
import {
  createFloatingPlayerSession,
  getFloatingPlayerSession,
  saveFloatingPlayerSession,
} from "@/player/floating-player-session";
import type { PlayerDiagnostics } from "@/player/hls-player";

vi.mock("@/player/hls-player", () => ({
  HlsPlayer: ({
    onDiagnosticsChange,
    title,
  }: {
    onDiagnosticsChange?: (diagnostics: PlayerDiagnostics) => void;
    title: string;
  }) => {
    useEffect(() => {
      onDiagnosticsChange?.({
        status: "playing",
        label: "Live",
        summary: "Live playback is stable.",
        technicalDetail: null,
        failureKind: null,
        recoveryState: "none",
        isMuted: false,
        isPaused: false,
        volume: 0.65,
        isPictureInPictureActive: true,
        pictureInPictureMode: "detached",
        isFullscreenActive: false,
        canPictureInPicture: true,
        canSeek: false,
        isAtLiveEdge: true,
        liveLatencySeconds: null,
      });
    }, [onDiagnosticsChange]);

    return <div>{title} detached mock player</div>;
  },
}));

describe("FloatingPlayerPage", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, "close", {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
    Object.defineProperty(window, "open", {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the detached player chrome and syncs runtime state into session storage", async () => {
    const session = createFloatingPlayerSession(
      {
        title: "Ops Feed",
        src: "https://example.com/live.m3u8",
        returnPath: "/multiview?channels=ops-feed",
        muted: true,
        preferredQuality: "AUTO",
        window: {
          left: 80,
          top: 48,
          width: 420,
          height: 236,
        },
      },
      new Date("2026-04-04T09:00:00.000Z"),
    );

    saveFloatingPlayerSession(session);

    render(
      <MemoryRouter initialEntries={[`/floating-player/${session.id}`]}>
        <Routes>
          <Route path="/floating-player/:sessionId" element={<FloatingPlayerPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Ops Feed detached mock player")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Return to app" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();

    expect(getFloatingPlayerSession(session.id)).toMatchObject({
      muted: false,
      runtimeState: {
        status: "playing",
        pictureInPictureMode: "detached",
        volume: 0.65,
      },
    });
  });
});
