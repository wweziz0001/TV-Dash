import type { LayoutType } from "@tv-dash/shared";
import { getLayoutDefinition } from "./layouts";

export interface TileState {
  channelId: string | null;
  preferredQuality: string;
  isMuted: boolean;
}

interface NormalizeTileAudioOptions {
  preferredActiveIndex?: number | null;
  ensureAudioOwner?: boolean;
}

export function getDefaultTilePreferredQuality(isMuted: boolean) {
  return isMuted ? "LOWEST" : "AUTO";
}

export function syncTileQualityForMutedState(tile: TileState): TileState {
  if (tile.isMuted && tile.preferredQuality === "AUTO") {
    return { ...tile, preferredQuality: "LOWEST" };
  }

  if (!tile.isMuted && tile.preferredQuality === "LOWEST") {
    return { ...tile, preferredQuality: "AUTO" };
  }

  return tile;
}

export function createDefaultTile(index: number, channelId: string | null = null): TileState {
  const isMuted = index !== 0;
  return {
    channelId,
    preferredQuality: getDefaultTilePreferredQuality(isMuted),
    isMuted,
  };
}

export function buildTileDefaults(layoutType: LayoutType, seededChannelIds: string[] = []) {
  const tileCount = getLayoutDefinition(layoutType).tileCount;
  return Array.from({ length: tileCount }, (_, index) => createDefaultTile(index, seededChannelIds[index] ?? null));
}

export function normalizeTileAudio(
  tiles: TileState[],
  { preferredActiveIndex, ensureAudioOwner = false }: NormalizeTileAudioOptions = {},
) {
  if (!tiles.length) {
    return [];
  }

  const preferredIndex =
    typeof preferredActiveIndex === "number" && preferredActiveIndex >= 0 && preferredActiveIndex < tiles.length
      ? preferredActiveIndex
      : null;

  const firstActiveIndex = tiles.findIndex((tile) => !tile.isMuted);
  const resolvedActiveIndex = preferredIndex ?? firstActiveIndex;

  if (resolvedActiveIndex < 0 && !ensureAudioOwner) {
    return tiles.map(syncTileQualityForMutedState);
  }

  const activeIndex = resolvedActiveIndex < 0 ? 0 : resolvedActiveIndex;

  return tiles.map((tile, tileIndex) =>
    syncTileQualityForMutedState({
      ...tile,
      isMuted: tileIndex !== activeIndex,
    }),
  );
}

interface ResizeTilesOptions {
  ensureAudioOwner?: boolean;
}

export function resizeTiles(layoutType: LayoutType, currentTiles: TileState[], options: ResizeTilesOptions = {}) {
  const nextCount = getLayoutDefinition(layoutType).tileCount;
  const nextTiles = [...currentTiles];

  if (nextTiles.length < nextCount) {
    const startingIndex = nextTiles.length;
    for (let index = startingIndex; index < nextCount; index += 1) {
      nextTiles.push(createDefaultTile(index));
    }
  }

  return normalizeTileAudio(nextTiles.slice(0, nextCount), {
    ensureAudioOwner: options.ensureAudioOwner ?? true,
  });
}

export function enforceSingleActiveAudio(tiles: TileState[], activeTileIndex: number) {
  const targetTile = tiles[activeTileIndex];

  if (!targetTile) {
    return tiles.map(syncTileQualityForMutedState);
  }

  if (!targetTile.isMuted) {
    return tiles.map((tile) =>
      syncTileQualityForMutedState({
        ...tile,
        isMuted: true,
      }),
    );
  }

  return normalizeTileAudio(tiles, { preferredActiveIndex: activeTileIndex });
}
