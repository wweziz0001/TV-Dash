import { describe, expect, it } from "vitest";
import {
  buildTileDefaults,
  enforceSingleActiveAudio,
  normalizeTileAudio,
  resizeTiles,
} from "./multiview-layout";

describe("buildTileDefaults", () => {
  it("creates mute-safe defaults for multi-view layouts", () => {
    const tiles = buildTileDefaults("LAYOUT_2X2", ["a", "b"]);

    expect(tiles).toEqual([
      { channelId: "a", preferredQuality: "AUTO", isMuted: false },
      { channelId: "b", preferredQuality: "LOWEST", isMuted: true },
      { channelId: null, preferredQuality: "LOWEST", isMuted: true },
      { channelId: null, preferredQuality: "LOWEST", isMuted: true },
    ]);
  });
});

describe("resizeTiles", () => {
  it("extends layouts with safe defaults and trims excess tiles", () => {
    const grown = resizeTiles("LAYOUT_1X1", [{ channelId: "a", preferredQuality: "AUTO", isMuted: false }]);
    expect(grown).toHaveLength(1);

    const expanded = resizeTiles("LAYOUT_FOCUS_1_2", grown);
    expect(expanded).toEqual([
      { channelId: "a", preferredQuality: "AUTO", isMuted: false },
      { channelId: null, preferredQuality: "LOWEST", isMuted: true },
      { channelId: null, preferredQuality: "LOWEST", isMuted: true },
    ]);
  });

  it("reassigns audio ownership safely when the active tile is removed", () => {
    const tiles = resizeTiles(
      "LAYOUT_1X1",
      [
        { channelId: "a", preferredQuality: "LOWEST", isMuted: true },
        { channelId: "b", preferredQuality: "AUTO", isMuted: false },
      ],
      { ensureAudioOwner: true },
    );

    expect(tiles).toEqual([{ channelId: "a", preferredQuality: "AUTO", isMuted: false }]);
  });
});

describe("enforceSingleActiveAudio", () => {
  it("keeps one active audio tile at a time and toggles the selected tile", () => {
    const tiles = [
      { channelId: "a", preferredQuality: "AUTO", isMuted: false },
      { channelId: "b", preferredQuality: "LOWEST", isMuted: true },
      { channelId: "c", preferredQuality: "LOWEST", isMuted: true },
    ];

    expect(enforceSingleActiveAudio(tiles, 1)).toEqual([
      { channelId: "a", preferredQuality: "LOWEST", isMuted: true },
      { channelId: "b", preferredQuality: "AUTO", isMuted: false },
      { channelId: "c", preferredQuality: "LOWEST", isMuted: true },
    ]);

    expect(enforceSingleActiveAudio(tiles, 0)).toEqual([
      { channelId: "a", preferredQuality: "LOWEST", isMuted: true },
      { channelId: "b", preferredQuality: "LOWEST", isMuted: true },
      { channelId: "c", preferredQuality: "LOWEST", isMuted: true },
    ]);
  });
});

describe("normalizeTileAudio", () => {
  it("keeps only the preferred active tile unmuted", () => {
    const tiles = normalizeTileAudio(
      [
        { channelId: "a", preferredQuality: "AUTO", isMuted: false },
        { channelId: "b", preferredQuality: "AUTO", isMuted: false },
      ],
      { preferredActiveIndex: 1, ensureAudioOwner: true },
    );

    expect(tiles).toEqual([
      { channelId: "a", preferredQuality: "LOWEST", isMuted: true },
      { channelId: "b", preferredQuality: "AUTO", isMuted: false },
    ]);
  });
});
