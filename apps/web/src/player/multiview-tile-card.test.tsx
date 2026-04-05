import { useEffect } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MultiviewTileCard } from "./multiview-tile-card";
import type { LayoutDefinition } from "./layouts";
import { buildPlayerDiagnostics } from "./playback-diagnostics";

const hlsPlayerLifecycle = {
  mounts: 0,
  unmounts: 0,
};
const hlsPlayerProps = {
  controlDensity: null as string | null,
};

vi.mock("./hls-player", () => ({
  HlsPlayer: ({ title, controlDensity }: { title: string; controlDensity?: string }) => {
    useEffect(() => {
      hlsPlayerLifecycle.mounts += 1;
      hlsPlayerProps.controlDensity = controlDensity ?? null;

      return () => {
        hlsPlayerLifecycle.unmounts += 1;
      };
    }, []);

    return <div>{title} player</div>;
  },
}));

const layoutDefinition: LayoutDefinition = {
  type: "LAYOUT_2X2",
  label: "2x2",
  description: "Quad wall",
  tileCount: 4,
  containerClassName: "grid-cols-1 sm:grid-cols-2",
  tileClassNames: Array.from({ length: 4 }, () => "min-h-[220px] sm:min-h-[260px] 2xl:min-h-[320px]"),
};

const defaultPlayerDiagnostics = buildPlayerDiagnostics({
  status: "playing",
  muted: false,
});

describe("MultiviewTileCard", () => {
  beforeEach(() => {
    cleanup();
    hlsPlayerLifecycle.mounts = 0;
    hlsPlayerLifecycle.unmounts = 0;
    hlsPlayerProps.controlDensity = null;
  });

  it("keeps the guide collapsed until the operator toggles it", async () => {
    const user = userEvent.setup();

    render(
      <MultiviewTileCard
        channel={{
          id: "channel-1",
          name: "Ops Feed",
          slug: "ops-feed",
          logoUrl: null,
          sourceMode: "MASTER_PLAYLIST",
          masterHlsUrl: "https://example.com/live.m3u8",
          playbackMode: "DIRECT",
          manualVariantCount: 0,
          groupId: null,
          group: null,
          epgSourceId: null,
          epgChannelId: null,
          epgSource: null,
          isActive: true,
          sortOrder: 1,
          createdAt: "",
          updatedAt: "",
        }}
        guide={null}
        guideLoading={false}
        isDragging={false}
        isDragTarget={false}
        canDragSwap
        isFocused={false}
        isPickerTarget={false}
        layoutDefinition={layoutDefinition}
        onClear={vi.fn()}
        onDragEnd={vi.fn()}
        onDragOver={vi.fn()}
        onDragStart={vi.fn()}
        onDrop={vi.fn()}
        onFocus={vi.fn()}
        onFullscreen={vi.fn()}
        onOpenPicker={vi.fn()}
        onPreferredQualityChange={vi.fn()}
        onQualityOptionsChange={vi.fn()}
        onSelectedQualityChange={vi.fn()}
        onStatusChange={vi.fn()}
        onDiagnosticsChange={vi.fn()}
        onToggleAudio={vi.fn()}
        playerDiagnostics={defaultPlayerDiagnostics}
        playerStatus="playing"
        qualityOptions={[{ value: "AUTO", label: "Auto", height: null }]}
        src="https://example.com/live.m3u8"
        tile={{ channelId: "channel-1", isMuted: false, preferredQuality: "AUTO" }}
        tileIndex={0}
      />,
    );

    expect(screen.queryByText("Guide not linked")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show now and next guide" }));

    expect(screen.getAllByText("Guide not linked")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Hide now and next guide" }));

    expect(screen.queryAllByText("Guide not linked")).toHaveLength(0);
  });

  it("does not remount the player when focus or channel metadata changes but the source stays the same", () => {
    const { rerender } = render(
      <MultiviewTileCard
        channel={{
          id: "channel-1",
          name: "Ops Feed",
          slug: "ops-feed",
          logoUrl: null,
          sourceMode: "MASTER_PLAYLIST",
          masterHlsUrl: "https://example.com/live.m3u8",
          playbackMode: "DIRECT",
          manualVariantCount: 0,
          groupId: null,
          group: null,
          epgSourceId: null,
          epgChannelId: null,
          epgSource: null,
          isActive: true,
          sortOrder: 1,
          createdAt: "",
          updatedAt: "",
        }}
        guide={null}
        guideLoading={false}
        isDragging={false}
        isDragTarget={false}
        canDragSwap
        isFocused={false}
        isPickerTarget={false}
        layoutDefinition={layoutDefinition}
        onClear={vi.fn()}
        onDragEnd={vi.fn()}
        onDragOver={vi.fn()}
        onDragStart={vi.fn()}
        onDrop={vi.fn()}
        onFocus={vi.fn()}
        onFullscreen={vi.fn()}
        onOpenPicker={vi.fn()}
        onPreferredQualityChange={vi.fn()}
        onQualityOptionsChange={vi.fn()}
        onSelectedQualityChange={vi.fn()}
        onStatusChange={vi.fn()}
        onDiagnosticsChange={vi.fn()}
        onToggleAudio={vi.fn()}
        playerDiagnostics={defaultPlayerDiagnostics}
        playerStatus="playing"
        qualityOptions={[{ value: "AUTO", label: "Auto", height: null }]}
        src="https://example.com/live.m3u8"
        tile={{ channelId: "channel-1", isMuted: false, preferredQuality: "AUTO" }}
        tileIndex={0}
      />,
    );

    rerender(
      <MultiviewTileCard
        channel={{
          id: "channel-2",
          name: "Ops Feed Mirror",
          slug: "ops-feed-mirror",
          logoUrl: null,
          sourceMode: "MASTER_PLAYLIST",
          masterHlsUrl: "https://example.com/live.m3u8",
          playbackMode: "DIRECT",
          manualVariantCount: 0,
          groupId: null,
          group: null,
          epgSourceId: null,
          epgChannelId: null,
          epgSource: null,
          isActive: true,
          sortOrder: 2,
          createdAt: "",
          updatedAt: "",
        }}
        guide={null}
        guideLoading={false}
        isDragging={false}
        isDragTarget={false}
        canDragSwap
        isFocused
        isPickerTarget={false}
        layoutDefinition={layoutDefinition}
        onClear={vi.fn()}
        onDragEnd={vi.fn()}
        onDragOver={vi.fn()}
        onDragStart={vi.fn()}
        onDrop={vi.fn()}
        onFocus={vi.fn()}
        onFullscreen={vi.fn()}
        onOpenPicker={vi.fn()}
        onPreferredQualityChange={vi.fn()}
        onQualityOptionsChange={vi.fn()}
        onSelectedQualityChange={vi.fn()}
        onStatusChange={vi.fn()}
        onDiagnosticsChange={vi.fn()}
        onToggleAudio={vi.fn()}
        playerDiagnostics={defaultPlayerDiagnostics}
        playerStatus="playing"
        qualityOptions={[{ value: "AUTO", label: "Auto", height: null }]}
        src="https://example.com/live.m3u8"
        tile={{ channelId: "channel-2", isMuted: false, preferredQuality: "AUTO" }}
        tileIndex={0}
      />,
    );

    expect(hlsPlayerLifecycle.mounts).toBe(1);
    expect(hlsPlayerLifecycle.unmounts).toBe(0);
    expect(screen.getByText("Ops Feed Mirror player")).toBeInTheDocument();
  });

  it("hides drag-swap affordances when touch-first mode disables tile swapping", () => {
    render(
      <MultiviewTileCard
        canDragSwap={false}
        channel={{
          id: "channel-1",
          name: "Ops Feed",
          slug: "ops-feed",
          logoUrl: null,
          sourceMode: "MASTER_PLAYLIST",
          masterHlsUrl: "https://example.com/live.m3u8",
          playbackMode: "DIRECT",
          manualVariantCount: 0,
          groupId: null,
          group: null,
          epgSourceId: null,
          epgChannelId: null,
          epgSource: null,
          isActive: true,
          sortOrder: 1,
          createdAt: "",
          updatedAt: "",
        }}
        guide={null}
        guideLoading={false}
        isDragging={false}
        isDragTarget={false}
        isFocused={false}
        isPickerTarget={false}
        layoutDefinition={layoutDefinition}
        onClear={vi.fn()}
        onDragEnd={vi.fn()}
        onDragOver={vi.fn()}
        onDragStart={vi.fn()}
        onDrop={vi.fn()}
        onFocus={vi.fn()}
        onFullscreen={vi.fn()}
        onOpenPicker={vi.fn()}
        onPreferredQualityChange={vi.fn()}
        onQualityOptionsChange={vi.fn()}
        onSelectedQualityChange={vi.fn()}
        onStatusChange={vi.fn()}
        onDiagnosticsChange={vi.fn()}
        onToggleAudio={vi.fn()}
        playerDiagnostics={defaultPlayerDiagnostics}
        playerStatus="playing"
        qualityOptions={[{ value: "AUTO", label: "Auto", height: null }]}
        src="https://example.com/live.m3u8"
        tile={{ channelId: "channel-1", isMuted: false, preferredQuality: "AUTO" }}
        tileIndex={0}
      />,
    );

    expect(screen.queryByLabelText("Drag to swap tile positions")).not.toBeInTheDocument();
  });

  it("shows honest DVR capability and viewer-position copy for buffered playback", () => {
    render(
      <MultiviewTileCard
        canDragSwap={false}
        channel={{
          id: "channel-1",
          name: "Ops Feed",
          slug: "ops-feed",
          logoUrl: null,
          sourceMode: "MASTER_PLAYLIST",
          masterHlsUrl: "https://example.com/live.m3u8",
          playbackMode: "SHARED",
          manualVariantCount: 0,
          groupId: null,
          group: null,
          epgSourceId: null,
          epgChannelId: null,
          epgSource: null,
          isActive: true,
          sortOrder: 1,
          createdAt: "",
          updatedAt: "",
        }}
        guide={null}
        guideLoading={false}
        isDragging={false}
        isDragTarget={false}
        isFocused={false}
        isPickerTarget={false}
        layoutDefinition={layoutDefinition}
        onClear={vi.fn()}
        onDragEnd={vi.fn()}
        onDragOver={vi.fn()}
        onDragStart={vi.fn()}
        onDrop={vi.fn()}
        onFocus={vi.fn()}
        onFullscreen={vi.fn()}
        onOpenPicker={vi.fn()}
        onPreferredQualityChange={vi.fn()}
        onQualityOptionsChange={vi.fn()}
        onSelectedQualityChange={vi.fn()}
        onStatusChange={vi.fn()}
        onDiagnosticsChange={vi.fn()}
        onToggleAudio={vi.fn()}
        playerDiagnostics={buildPlayerDiagnostics({
          status: "playing",
          muted: false,
          canSeek: true,
          isAtLiveEdge: false,
          liveLatencySeconds: 32,
          timeshiftSupported: true,
          timeshiftAvailable: true,
          timeshiftAvailableWindowSeconds: 300,
        })}
        playerStatus="playing"
        qualityOptions={[{ value: "AUTO", label: "Auto", height: null }]}
        src="https://example.com/live.m3u8"
        tile={{ channelId: "channel-1", isMuted: false, preferredQuality: "AUTO" }}
        tileIndex={0}
        timeshiftStatus={{
          channelId: "channel-1",
          configured: true,
          supported: true,
          available: true,
          acquisitionMode: "SHARED_SESSION",
          bufferState: "READY",
          message: "Ready",
          windowSeconds: 1800,
          minimumReadyWindowSeconds: 30,
          availableWindowSeconds: 300,
          availableFromAt: "2026-04-04T23:55:00.000Z",
          availableUntilAt: "2026-04-05T00:00:00.000Z",
          bufferedSegmentCount: 40,
          lastUpdatedAt: "2026-04-05T00:00:00.000Z",
          lastError: null,
        }}
      />,
    );

    expect(screen.getByText("DVR ready · Retained 05:00 of 30:00")).toBeInTheDocument();
    expect(screen.getByText("Viewer 00:32 behind live · Playback is 32 seconds behind live inside the DVR window.")).toBeInTheDocument();
  });

  it("uses denser player controls for higher-count multiview layouts", () => {
    render(
      <MultiviewTileCard
        canDragSwap={false}
        channel={{
          id: "channel-1",
          name: "Ops Feed",
          slug: "ops-feed",
          logoUrl: null,
          sourceMode: "MASTER_PLAYLIST",
          masterHlsUrl: "https://example.com/live.m3u8",
          playbackMode: "DIRECT",
          manualVariantCount: 0,
          groupId: null,
          group: null,
          epgSourceId: null,
          epgChannelId: null,
          epgSource: null,
          isActive: true,
          sortOrder: 1,
          createdAt: "",
          updatedAt: "",
        }}
        guide={null}
        guideLoading={false}
        isDragging={false}
        isDragTarget={false}
        isFocused={false}
        isPickerTarget={false}
        layoutDefinition={{
          ...layoutDefinition,
          type: "LAYOUT_3X3",
          tileCount: 9,
          tileClassNames: Array.from({ length: 9 }, () => "min-h-[180px]"),
        }}
        onClear={vi.fn()}
        onDragEnd={vi.fn()}
        onDragOver={vi.fn()}
        onDragStart={vi.fn()}
        onDrop={vi.fn()}
        onFocus={vi.fn()}
        onFullscreen={vi.fn()}
        onOpenPicker={vi.fn()}
        onPreferredQualityChange={vi.fn()}
        onQualityOptionsChange={vi.fn()}
        onSelectedQualityChange={vi.fn()}
        onStatusChange={vi.fn()}
        onDiagnosticsChange={vi.fn()}
        onToggleAudio={vi.fn()}
        playerDiagnostics={defaultPlayerDiagnostics}
        playerStatus="playing"
        qualityOptions={[{ value: "AUTO", label: "Auto", height: null }]}
        src="https://example.com/live.m3u8"
        tile={{ channelId: "channel-1", isMuted: false, preferredQuality: "AUTO" }}
        tileIndex={0}
      />,
    );

    expect(hlsPlayerProps.controlDensity).toBe("micro");
  });
});
