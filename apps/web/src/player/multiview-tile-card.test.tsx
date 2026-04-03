import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MultiviewTileCard } from "./multiview-tile-card";
import type { LayoutDefinition } from "./layouts";

const hlsPlayerLifecycle = {
  mounts: 0,
  unmounts: 0,
};

vi.mock("./hls-player", () => ({
  HlsPlayer: ({ title }: { title: string }) => {
    useEffect(() => {
      hlsPlayerLifecycle.mounts += 1;

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
  containerClassName: "grid-cols-1 md:grid-cols-2",
  tileClassNames: ["min-h-[280px]", "min-h-[280px]", "min-h-[280px]", "min-h-[280px]"],
};

describe("MultiviewTileCard", () => {
  beforeEach(() => {
    hlsPlayerLifecycle.mounts = 0;
    hlsPlayerLifecycle.unmounts = 0;
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
        onToggleAudio={vi.fn()}
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
        onToggleAudio={vi.fn()}
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
        onToggleAudio={vi.fn()}
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
});
