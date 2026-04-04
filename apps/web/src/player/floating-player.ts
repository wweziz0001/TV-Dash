export interface FloatingPlayerLayout {
  left: number;
  top: number;
  width: number;
  height: number;
  zIndex: number;
}

const FLOATING_PLAYER_MARGIN = 24;
const FLOATING_PLAYER_STEP = 28;
const DEFAULT_FLOATING_PLAYER_WIDTH = 420;
const DEFAULT_FLOATING_PLAYER_HEIGHT = 236;
const MIN_FLOATING_PLAYER_WIDTH = 260;
const MIN_FLOATING_PLAYER_HEIGHT = 146;

let floatingPlayerZIndexSeed = 80;

export function countFloatingPlayers(doc: Document = document) {
  return doc.querySelectorAll("[data-tv-dash-floating-player='true']").length;
}

export function getNextFloatingPlayerZIndex() {
  floatingPlayerZIndexSeed += 1;
  return floatingPlayerZIndexSeed;
}

export function clampFloatingPlayerLayout(
  layout: Omit<FloatingPlayerLayout, "zIndex"> & { zIndex?: number },
  viewportWidth: number,
  viewportHeight: number,
): FloatingPlayerLayout {
  const maxWidth = Math.max(MIN_FLOATING_PLAYER_WIDTH, viewportWidth - FLOATING_PLAYER_MARGIN * 2);
  const maxHeight = Math.max(MIN_FLOATING_PLAYER_HEIGHT, viewportHeight - FLOATING_PLAYER_MARGIN * 2);
  const width = Math.min(Math.max(layout.width, MIN_FLOATING_PLAYER_WIDTH), maxWidth);
  const height = Math.min(Math.max(layout.height, MIN_FLOATING_PLAYER_HEIGHT), maxHeight);
  const left = Math.min(
    Math.max(layout.left, FLOATING_PLAYER_MARGIN),
    Math.max(FLOATING_PLAYER_MARGIN, viewportWidth - width - FLOATING_PLAYER_MARGIN),
  );
  const top = Math.min(
    Math.max(layout.top, FLOATING_PLAYER_MARGIN),
    Math.max(FLOATING_PLAYER_MARGIN, viewportHeight - height - FLOATING_PLAYER_MARGIN),
  );

  return {
    left,
    top,
    width,
    height,
    zIndex: layout.zIndex ?? getNextFloatingPlayerZIndex(),
  };
}

export function getDefaultFloatingPlayerLayout(
  floatingPlayerCount: number,
  viewportWidth: number,
  viewportHeight: number,
): FloatingPlayerLayout {
  const width = Math.min(DEFAULT_FLOATING_PLAYER_WIDTH, Math.max(MIN_FLOATING_PLAYER_WIDTH, viewportWidth - FLOATING_PLAYER_MARGIN * 2));
  const height = Math.min(DEFAULT_FLOATING_PLAYER_HEIGHT, Math.max(MIN_FLOATING_PLAYER_HEIGHT, viewportHeight - FLOATING_PLAYER_MARGIN * 2));
  const left = viewportWidth - width - FLOATING_PLAYER_MARGIN - (floatingPlayerCount % 3) * FLOATING_PLAYER_STEP;
  const top = FLOATING_PLAYER_MARGIN + (floatingPlayerCount % 4) * FLOATING_PLAYER_STEP;

  return clampFloatingPlayerLayout(
    {
      left,
      top,
      width,
      height,
      zIndex: getNextFloatingPlayerZIndex(),
    },
    viewportWidth,
    viewportHeight,
  );
}
