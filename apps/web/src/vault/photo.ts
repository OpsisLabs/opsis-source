export interface ImageDimensions {
  width: number;
  height: number;
}

export function readImageDimensions(bytes: Uint8Array, mimeType: string): ImageDimensions | null {
  if (mimeType === "image/png") return readPngDimensions(bytes);
  if (mimeType === "image/jpeg") return readJpegDimensions(bytes);
  if (mimeType === "image/webp") return readWebpDimensions(bytes);
  return null;
}

function readPngDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 24
    || bytes[0] !== 0x89
    || bytes[1] !== 0x50
    || bytes[2] !== 0x4e
    || bytes[3] !== 0x47
    || ascii(bytes, 12, 16) !== "IHDR") return null;
  return dimensions(readUint32Be(bytes, 16), readUint32Be(bytes, 20));
}

function readJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 10 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 1;
      continue;
    }
    if (offset + 2 >= bytes.length) return null;
    const segmentLength = (bytes[offset + 1] << 8) | bytes[offset + 2];
    if (segmentLength < 2 || offset + segmentLength >= bytes.length) return null;
    if (startOfFrame.has(marker)) {
      if (segmentLength < 7 || offset + 7 >= bytes.length) return null;
      return dimensions(
        (bytes[offset + 6] << 8) | bytes[offset + 7],
        (bytes[offset + 4] << 8) | bytes[offset + 5]
      );
    }
    offset += 1 + segmentLength;
  }
  return null;
}

function readWebpDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 12) !== "WEBP") return null;
  const chunk = ascii(bytes, 12, 16);
  if (chunk === "VP8X") {
    return dimensions(1 + readUint24Le(bytes, 24), 1 + readUint24Le(bytes, 27));
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8);
    const height = 1 + ((bytes[22] & 0xc0) >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10);
    return dimensions(width, height);
  }
  if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
    const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
    return dimensions(width, height);
  }
  return null;
}

function dimensions(width: number, height: number): ImageDimensions | null {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0
    ? { width, height }
    : null;
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function readUint24Le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}
