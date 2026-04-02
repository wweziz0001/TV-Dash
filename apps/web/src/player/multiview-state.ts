import type { LayoutType, SavedLayoutInput } from "@tv-dash/shared";
import type { QualityOption, SavedLayout } from "@/types/api";
import { defaultQualityOptions } from "./quality-options";
import {
  getDefaultTilePreferredQuality,
  normalizeTileAudio,
  resizeTiles,
  type TileState,
} from "./multiview-layout";

function clampTileIndex(index: number | null, tileCount: number) {
  if (tileCount === 0) {
    return 0;
  }

  if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
    return 0;
  }

  return Math.min(index, tileCount - 1);
}

function readConfigTileIndex(layout: SavedLayout, key: "activeAudioTile" | "focusedTileIndex") {
  const value = layout.configJson[key];
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function serializeMultiviewLayout(
  name: string,
  layoutType: LayoutType,
  tiles: TileState[],
  focusedTileIndex: number,
): SavedLayoutInput {
  const activeAudioTile = tiles.findIndex((tile) => !tile.isMuted);

  return {
    name,
    layoutType,
    configJson: {
      activeAudioTile: activeAudioTile >= 0 ? activeAudioTile : null,
      focusedTileIndex,
    },
    items: tiles.map((tile, index) => ({
      tileIndex: index,
      channelId: tile.channelId,
      preferredQuality: tile.preferredQuality,
      isMuted: tile.isMuted,
    })),
  };
}

export function hydrateMultiviewLayout(layout: SavedLayout) {
  const savedTiles = layout.items
    .slice()
    .sort((left, right) => left.tileIndex - right.tileIndex)
    .map((item, index) => ({
      channelId: item.channelId,
      preferredQuality: item.preferredQuality ?? getDefaultTilePreferredQuality(index !== 0),
      isMuted: item.isMuted,
    }));

  const preferredActiveIndex = readConfigTileIndex(layout, "activeAudioTile");
  const shouldEnsureAudioOwner = preferredActiveIndex !== null || savedTiles.some((tile) => !tile.isMuted);
  const resizedTiles = resizeTiles(layout.layoutType, savedTiles, {
    ensureAudioOwner: shouldEnsureAudioOwner,
  });
  const tiles =
    preferredActiveIndex === null
      ? normalizeTileAudio(resizedTiles, {
          ensureAudioOwner: shouldEnsureAudioOwner,
        })
      : normalizeTileAudio(resizedTiles, {
          preferredActiveIndex,
          ensureAudioOwner: true,
        });

  return {
    tiles,
    focusedTileIndex: clampTileIndex(readConfigTileIndex(layout, "focusedTileIndex"), tiles.length),
  };
}

export function replaceTileChannel(tiles: TileState[], tileIndex: number, channelId: string | null) {
  return tiles.map((tile, index) =>
    index === tileIndex
      ? {
          ...tile,
          channelId,
          preferredQuality: getDefaultTilePreferredQuality(tile.isMuted),
        }
      : tile,
  );
}

export function swapTiles(tiles: TileState[], sourceIndex: number, targetIndex: number) {
  if (sourceIndex === targetIndex || !tiles[sourceIndex] || !tiles[targetIndex]) {
    return tiles;
  }

  const nextTiles = [...tiles];
  [nextTiles[sourceIndex], nextTiles[targetIndex]] = [nextTiles[targetIndex], nextTiles[sourceIndex]];
  return nextTiles;
}

export function setTilePreferredQuality(tiles: TileState[], tileIndex: number, preferredQuality: string) {
  return tiles.map((tile, index) => (index === tileIndex ? { ...tile, preferredQuality } : tile));
}

export function pruneTileScopedState<T>(record: Record<number, T>, tileCount: number) {
  const nextEntries = Object.entries(record).filter(([key]) => Number(key) < tileCount);
  return Object.fromEntries(nextEntries) as Record<number, T>;
}

export function setTileQualityOptions(
  record: Record<number, QualityOption[]>,
  tileIndex: number,
  options: QualityOption[],
) {
  return {
    ...record,
    [tileIndex]: options.length ? options : [...defaultQualityOptions],
  };
}

export function resetTileQualityOptions(record: Record<number, QualityOption[]>, tileIndex: number) {
  return {
    ...record,
    [tileIndex]: [...defaultQualityOptions],
  };
}

export function swapTileScopedState<T>(record: Record<number, T>, sourceIndex: number, targetIndex: number) {
  if (sourceIndex === targetIndex) {
    return record;
  }

  const nextRecord = { ...record };
  const sourceValue = nextRecord[sourceIndex];
  const targetValue = nextRecord[targetIndex];

  if (typeof targetValue === "undefined") {
    delete nextRecord[sourceIndex];
  } else {
    nextRecord[sourceIndex] = targetValue;
  }

  if (typeof sourceValue === "undefined") {
    delete nextRecord[targetIndex];
  } else {
    nextRecord[targetIndex] = sourceValue;
  }

  return nextRecord;
}
