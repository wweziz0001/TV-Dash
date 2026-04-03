import { describe, expect, it } from "vitest";
import {
  buildRecordingThumbnailPath,
  getRecordingThumbnailMimeType,
  resolveRecordingThumbnailOffsetSeconds,
} from "./recording-thumbnail.js";

describe("recording-thumbnail", () => {
  it("stores thumbnails next to the recording as a deterministic sidecar path", () => {
    expect(buildRecordingThumbnailPath("2026/04/03/example-recording.mp4")).toBe(
      "2026/04/03/example-recording.thumbnail.jpg",
    );
  });

  it("uses a real image mime type for generated recording previews", () => {
    expect(getRecordingThumbnailMimeType()).toBe("image/jpeg");
  });

  it("chooses a practical capture offset for short and long recordings", () => {
    expect(resolveRecordingThumbnailOffsetSeconds(null)).toBe(15);
    expect(resolveRecordingThumbnailOffsetSeconds(6)).toBe(1);
    expect(resolveRecordingThumbnailOffsetSeconds(60)).toBe(12);
    expect(resolveRecordingThumbnailOffsetSeconds(1200)).toBe(120);
  });
});
