import { describe, expect, it } from "vitest";
import type { SavedLayout } from "@/types/api";
import {
  hydrateMultiviewLayout,
  pruneTileScopedState,
  replaceTileChannel,
  serializeMultiviewLayout,
  swapTileScopedState,
  swapTiles,
} from "./multiview-state";

describe("serializeMultiviewLayout", () => {
  it("captures tile state, active audio ownership, and focused tile metadata", () => {
    expect(
      serializeMultiviewLayout(
        "Ops Wall",
        "LAYOUT_2X2",
        [
          { channelId: "a", preferredQuality: "AUTO", isMuted: false },
          { channelId: "b", preferredQuality: "LOWEST", isMuted: true },
        ],
        1,
      ),
    ).toEqual({
      name: "Ops Wall",
      layoutType: "LAYOUT_2X2",
      configJson: {
        activeAudioTile: 0,
        focusedTileIndex: 1,
      },
      items: [
        { tileIndex: 0, channelId: "a", preferredQuality: "AUTO", isMuted: false },
        { tileIndex: 1, channelId: "b", preferredQuality: "LOWEST", isMuted: true },
      ],
    });
  });
});

describe("hydrateMultiviewLayout", () => {
  it("orders saved items, restores the focused tile, and keeps only one active audio tile", () => {
    const layout: SavedLayout = {
      id: "layout-1",
      userId: "user-1",
      name: "Ops Wall",
      layoutType: "LAYOUT_2X2",
      configJson: {
        activeAudioTile: 1,
        focusedTileIndex: 3,
      },
      items: [
        {
          id: "item-2",
          tileIndex: 1,
          channelId: "b",
          preferredQuality: "LOWEST",
          isMuted: true,
        },
        {
          id: "item-1",
          tileIndex: 0,
          channelId: "a",
          preferredQuality: "AUTO",
          isMuted: false,
        },
      ],
      createdAt: "",
      updatedAt: "",
    };

    expect(hydrateMultiviewLayout(layout)).toEqual({
      tiles: [
        { channelId: "a", preferredQuality: "LOWEST", isMuted: true },
        { channelId: "b", preferredQuality: "AUTO", isMuted: false },
        { channelId: null, preferredQuality: "LOWEST", isMuted: true },
        { channelId: null, preferredQuality: "LOWEST", isMuted: true },
      ],
      focusedTileIndex: 3,
    });
  });
});

describe("replaceTileChannel", () => {
  it("resets a tile to safe default quality when the channel changes", () => {
    expect(
      replaceTileChannel(
        [
          { channelId: "a", preferredQuality: "2", isMuted: false },
          { channelId: "b", preferredQuality: "AUTO", isMuted: true },
        ],
        1,
        "c",
      ),
    ).toEqual([
      { channelId: "a", preferredQuality: "2", isMuted: false },
      { channelId: "c", preferredQuality: "LOWEST", isMuted: true },
    ]);
  });
});

describe("pruneTileScopedState", () => {
  it("drops tile-scoped records for removed layout slots", () => {
    expect(pruneTileScopedState({ 0: "ok", 1: "loading", 3: "error" }, 2)).toEqual({
      0: "ok",
      1: "loading",
    });
  });
});

describe("swapTiles", () => {
  it("swaps tile positions without mutating the rest of the wall", () => {
    expect(
      swapTiles(
        [
          { channelId: "a", preferredQuality: "AUTO", isMuted: false },
          { channelId: "b", preferredQuality: "LOWEST", isMuted: true },
          { channelId: "c", preferredQuality: "LOWEST", isMuted: true },
        ],
        0,
        2,
      ),
    ).toEqual([
      { channelId: "c", preferredQuality: "LOWEST", isMuted: true },
      { channelId: "b", preferredQuality: "LOWEST", isMuted: true },
      { channelId: "a", preferredQuality: "AUTO", isMuted: false },
    ]);
  });
});

describe("swapTileScopedState", () => {
  it("swaps keyed tile metadata alongside a drag-and-drop reassignment", () => {
    expect(swapTileScopedState({ 0: "playing", 2: "error" }, 0, 2)).toEqual({
      0: "error",
      2: "playing",
    });
  });
});
