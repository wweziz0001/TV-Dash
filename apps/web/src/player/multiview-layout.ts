import type { LayoutType } from "@tv-dash/shared";
import { getLayoutDefinition } from "./layouts";

export interface TileState {
  channelId: string | null;
  preferredQuality: string;
  isMuted: boolean;
}

export function createDefaultTile(index: number, channelId: string | null = null): TileState {
  return {
    channelId,
    preferredQuality: index === 0 ? "AUTO" : "LOWEST",
    isMuted: index !== 0,
  };
}

export function buildTileDefaults(layoutType: LayoutType, seededChannelIds: string[] = []) {
  const tileCount = getLayoutDefinition(layoutType).tileCount;
  return Array.from({ length: tileCount }, (_, index) => createDefaultTile(index, seededChannelIds[index] ?? null));
}

export function resizeTiles(layoutType: LayoutType, currentTiles: TileState[]) {
  const nextCount = getLayoutDefinition(layoutType).tileCount;
  const nextTiles = [...currentTiles];

  if (nextTiles.length < nextCount) {
    const startingIndex = nextTiles.length;
    for (let index = startingIndex; index < nextCount; index += 1) {
      nextTiles.push(createDefaultTile(index));
    }
  }

  return nextTiles.slice(0, nextCount);
}

export function enforceSingleActiveAudio(tiles: TileState[], activeTileIndex: number) {
  return tiles.map((entry, tileIndex) => ({
    ...entry,
    isMuted: tileIndex === activeTileIndex ? !entry.isMuted : true,
  }));
}
