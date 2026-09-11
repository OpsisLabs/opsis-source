export type Position = {
  id: string;
  label: string;
  value: string;
};

export type Shock = {
  scope: "all" | "single";
  percent: number;
  positionId: string;
};

export type StressRow = {
  id: string;
  label: string;
  before: bigint;
  after: bigint;
  delta: bigint;
  shareBps: number;
};

export type StressResult = {
  before: bigint;
  after: bigint;
  delta: bigint;
  changeBps: number;
  largestShareBps: number;
  largestId: string;
  rows: StressRow[];
};

export type StressErrorCode =
  "positions" | "identity" | "value" | "total" | "shock";

const MAX_POSITIONS = 10;
const MAX_LABEL_LENGTH = 40;
const MAX_VALUE_CENTS = 100000000000n;
const CENTS_PER_DOLLAR = 100n;
const BPS = 10000n;
const VALUE_PATTERN = /^\d+(\.\d{1,2})?$/;

function fail(code: StressErrorCode): never {
  throw new Error(code);
}

function parseCents(raw: string): bigint {
  if (typeof raw !== "string" || raw.length > 14 || !VALUE_PATTERN.test(raw))
    fail("value");
  const [whole, fraction = ""] = raw.split(".");
  const cents =
    BigInt(whole) * CENTS_PER_DOLLAR + BigInt((fraction + "00").slice(0, 2));
  if (cents > MAX_VALUE_CENTS) fail("value");
  return cents;
}

function roundHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const rounded = (absolute * 2n + denominator) / (denominator * 2n);
  return negative ? -rounded : rounded;
}

function toBps(part: bigint, total: bigint): number {
  return Number(roundHalfAwayFromZero(part * BPS, total));
}

export function stress(positions: Position[], shock: Shock): StressResult {
  if (!Array.isArray(positions)) fail("positions");
  if (positions.length < 1 || positions.length > MAX_POSITIONS)
    fail("positions");

  const seen = new Set<string>();
  const parsed: Array<{ id: string; label: string; before: bigint }> = [];

  for (const position of positions) {
    if (
      position === null ||
      typeof position !== "object" ||
      Array.isArray(position)
    )
      fail("positions");
    const { id, label, value } = position as Position;
    if (typeof id !== "string" || id.trim().length === 0) fail("identity");
    if (seen.has(id)) fail("identity");
    seen.add(id);
    if (typeof label !== "string") fail("identity");
    const trimmedLabel = label.trim();
    if (trimmedLabel.length < 1 || trimmedLabel.length > MAX_LABEL_LENGTH)
      fail("identity");
    parsed.push({ id, label: trimmedLabel, before: parseCents(value) });
  }

  let before = 0n;
  for (const row of parsed) before += row.before;
  if (before <= 0n) fail("total");

  if (shock === null || typeof shock !== "object" || Array.isArray(shock))
    fail("shock");
  const { scope, percent } = shock;
  if (scope !== "all" && scope !== "single") fail("shock");
  if (
    typeof percent !== "number" ||
    !Number.isInteger(percent) ||
    percent < -100 ||
    percent > 100
  ) {
    fail("shock");
  }

  let selectedId: string | null = null;
  if (scope === "single") {
    const { positionId } = shock;
    if (typeof positionId !== "string" || !seen.has(positionId)) fail("shock");
    selectedId = positionId;
  }

  const rows: StressRow[] = parsed.map(({ id, label, before: rowBefore }) => {
    const affected = scope === "all" || id === selectedId;
    const after = affected
      ? roundHalfAwayFromZero(
          rowBefore * (CENTS_PER_DOLLAR + BigInt(percent)),
          CENTS_PER_DOLLAR,
        )
      : rowBefore;
    return {
      id,
      label,
      before: rowBefore,
      after,
      delta: after - rowBefore,
      shareBps: 0,
    };
  });

  let after = 0n;
  for (const row of rows) after += row.after;

  let largest = rows[0];
  for (const row of rows) {
    if (row.before > largest.before) largest = row;
    row.shareBps = toBps(row.before, before);
  }

  const delta = after - before;

  return {
    before,
    after,
    delta,
    changeBps: toBps(delta, before),
    largestShareBps: largest.shareBps,
    largestId: largest.id,
    rows,
  };
}

export function examplePositions(kind: "concentrated" | "spread"): Position[] {
  if (kind === "concentrated") {
    return [
      { id: "asset-a", label: "Asset A", value: "7000" },
      { id: "asset-b", label: "Asset B", value: "2000" },
      { id: "asset-c", label: "Asset C", value: "1000" },
    ];
  }
  if (kind === "spread") {
    return [
      { id: "asset-a", label: "Asset A", value: "4000" },
      { id: "asset-b", label: "Asset B", value: "3000" },
      { id: "asset-c", label: "Asset C", value: "3000" },
    ];
  }
  return fail("positions");
}
