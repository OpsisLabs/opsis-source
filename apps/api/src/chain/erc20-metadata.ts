export function decodeErc20Metadata(field: string, value: unknown): string | number | null {
  if (typeof value !== "string" || !/^0x(?:[0-9a-f]{2})+$/i.test(value)) return null;
  const hex = value.slice(2);
  if (field === "decimals" || field === "totalSupply") {
    if (hex.length !== 64) return null;
    const integer = BigInt(value);
    return field === "decimals" ? (integer <= 255n ? Number(integer) : null) : integer.toString();
  }
  if (field !== "name" && field !== "symbol") return null;
  let payload: string;
  if (hex.length === 64) {
    payload = hex;
    while (payload.endsWith("00")) payload = payload.slice(0, -2);
  } else {
    if (hex.length < 128 || hex.length % 64 !== 0 || BigInt(`0x${hex.slice(0, 64)}`) !== 32n) return null;
    const length = BigInt(`0x${hex.slice(64, 128)}`);
    if (length < 1n || length > 256n) return null;
    const bytes = Number(length) * 2;
    payload = hex.slice(128, 128 + bytes);
    const padding = hex.slice(128 + bytes);
    if (payload.length !== bytes || padding.length !== Math.ceil(bytes / 64) * 64 - bytes || !/^0*$/.test(padding)) return null;
  }
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(payload, "hex"))
      .replace(/[\p{Cc}\p{Cf}]/gu, "").trim();
    return decoded && [...decoded].length <= 64 ? decoded : null;
  } catch { return null; }
}
