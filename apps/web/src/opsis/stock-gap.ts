/** Unit-safe local scenario math: do not multiply a token oracle by M again. */
function decimal(value: string): [bigint, bigint] {
  if (!/^(?:0|[1-9]\d{0,35})(?:\.\d{1,36})?$/.test(value))
    throw new Error("Invalid decimal");
  const [whole, fraction = ""] = value.split(".");
  const raw = BigInt(whole + fraction);
  if (raw === 0n) throw new Error("Positive input required");
  return [raw, 10n ** BigInt(fraction.length)];
}
export function stockGap(input: {
  dex: string;
  reference: string;
  multiplier: string;
  mode: "underlying" | "oracle";
  unit: string;
  referenceUnit: string;
}): string {
  if (
    !["USD", "USDG"].includes(input.unit) ||
    input.unit !== input.referenceUnit
  )
    throw new Error("Incompatible quote currencies");
  const [d, ds] = decimal(input.dex),
    [u, us] = decimal(input.reference);
  const [m, ms] =
    input.mode === "underlying" ? decimal(input.multiplier) : [1n, 1n];
  const numerator = d * us * ms,
    denominator = ds * u * m;
  const fixed = ((numerator - denominator) * 1_000_000n) / denominator;
  const abs = fixed < 0n ? -fixed : fixed;
  const digits = abs.toString().padStart(5, "0");
  return `${fixed < 0n ? "-" : ""}${digits.slice(0, -4)}.${digits.slice(-4)}`;
}
