import { describe, expect, it } from "vitest";
import { readImageDimensions } from "./photo";

describe("local photo header validation", () => {
  it("reads PNG dimensions before browser decode", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47], 0);
    png.set([0x49, 0x48, 0x44, 0x52], 12);
    png.set([0, 0, 6, 64, 0, 0, 3, 32], 16);
    expect(readImageDimensions(png, "image/png")).toEqual({ width: 1600, height: 800 });
  });

  it("reads baseline JPEG dimensions and rejects malformed input", () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0x20, 0x06, 0x40,
      0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00
    ]);
    expect(readImageDimensions(jpeg, "image/jpeg")).toEqual({ width: 1600, height: 800 });
    expect(readImageDimensions(new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg")).toBeNull();
  });

  it("reads extended WebP dimensions and rejects an unknown WebP chunk", () => {
    const webp = new Uint8Array(30);
    webp.set(new TextEncoder().encode("RIFF"), 0);
    webp.set(new TextEncoder().encode("WEBPVP8X"), 8);
    webp.set([0x3f, 0x06, 0x00], 24);
    webp.set([0x1f, 0x03, 0x00], 27);
    expect(readImageDimensions(webp, "image/webp")).toEqual({ width: 1600, height: 800 });
    webp.set(new TextEncoder().encode("NOPE"), 12);
    expect(readImageDimensions(webp, "image/webp")).toBeNull();
  });
});
