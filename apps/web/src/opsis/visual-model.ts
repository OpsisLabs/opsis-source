/** Chart geometry only: preserve raw integer precision until the bounded ratio. */
export function relativeBar(value: string, values: string[]): number {
  if (!/^\d+$/.test(value) || values.some((item) => !/^\d+$/.test(item)))
    return 0;
  const max = values.reduce(
    (largest, item) => (BigInt(item) > largest ? BigInt(item) : largest),
    0n,
  );
  return max === 0n ? 0 : Number((BigInt(value) * 10_000n) / max) / 100;
}
/** Align display decimals only for chart geometry; exact labels remain untouched. */
export function decimalBars(values: string[]): number[] | null {
  if (
    !values.length ||
    values.some((value) => value.length > 256 || !/^\d+(?:\.\d+)?$/.test(value))
  )
    return null;
  const precision = Math.max(
    ...values.map((value) => value.split(".")[1]?.length ?? 0),
  );
  if (precision > 36) return null;
  const raw = values.map((value) => {
    const [whole, fraction = ""] = value.split(".");
    return whole + fraction.padEnd(precision, "0");
  });
  return raw.map((value) => relativeBar(value, raw));
}
