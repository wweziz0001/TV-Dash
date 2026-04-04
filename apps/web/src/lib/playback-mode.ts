import { isTvDashManagedPlaybackMode, type StreamPlaybackMode } from "@tv-dash/shared";

export { isTvDashManagedPlaybackMode };

export function getPlaybackModeLabel(playbackMode: StreamPlaybackMode) {
  switch (playbackMode) {
    case "SHARED":
      return "Shared delivery";
    case "PROXY":
      return "Proxy playback";
    default:
      return "Direct playback";
  }
}

export function getPlaybackModeShortLabel(playbackMode: StreamPlaybackMode) {
  switch (playbackMode) {
    case "SHARED":
      return "Shared";
    case "PROXY":
      return "Proxy";
    default:
      return "Direct";
  }
}
