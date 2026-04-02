import type { LayoutType } from "@tv-dash/shared";
import { layoutDefinitions } from "./layouts";

const LAYOUT_SHORTCUTS: LayoutType[] = layoutDefinitions.map((layout) => layout.type);

export function getWrappedTileIndex(currentIndex: number, offset: number, tileCount: number) {
  if (tileCount <= 0) {
    return 0;
  }

  const nextIndex = (currentIndex + offset) % tileCount;
  return nextIndex < 0 ? nextIndex + tileCount : nextIndex;
}

export function getLayoutTypeForShortcut(key: string) {
  const shortcutIndex = Number(key) - 1;

  if (!Number.isInteger(shortcutIndex) || shortcutIndex < 0) {
    return null;
  }

  return LAYOUT_SHORTCUTS[shortcutIndex] ?? null;
}
