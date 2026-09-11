import {
  BPS_PER_UNIT,
  MAX_POSITION_CENTS,
  MAX_POSITIONS,
  MAX_TOTAL_CENTS,
  bpsToWeightString,
  parseWeightBps,
  toBps,
} from "./money";

export type WeightInput = { id: string; weight: string };

export type ComparisonErrorCode =
  | "positions"
  | "identity"
  | "weightValue"
  | "weightSum"
  | "value";

export type ComparableRow = { id: string; label: string; cents: bigint };

export type ComparisonRow = {
  id: string;
  label: string;
  currentCents: bigint;
  proposedCents: bigint;
  currentBps: number;
  proposedBps: number;
  deltaCents: bigint;
  deltaBps: number;
};

export type Comparison = {
  totalCents: bigint;
  rows: ComparisonRow[];
};

export type OutcomeRow = ComparisonRow & {
  currentAfter: bigint;
  proposedAfter: bigint;
  scenarioDeltaCurrent: bigint;
  scenarioDeltaProposed: bigint;
  plDelta: bigint;
};

export type OutcomeComparison = {
  currentAfter: bigint;
  proposedAfter: bigint;
  difference: bigint;
  rows: OutcomeRow[];
  largest: OutcomeRow | null;
};

function fail(code: ComparisonErrorCode): never {
  throw new Error(code);
}

export function validateRows(rows: ComparableRow[]): bigint {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_POSITIONS)
    fail("positions");
  const seen = new Set<string>();
  let total = 0n;
  for (const row of rows) {
    if (typeof row !== "object" || row === null || Array.isArray(row))
      fail("positions");
    if (typeof row.id !== "string" || row.id.trim().length === 0)
      fail("identity");
    if (seen.has(row.id)) fail("identity");
    seen.add(row.id);
    if (typeof row.label !== "string") fail("identity");
    if (typeof row.cents !== "bigint" || row.cents < 0n) fail("value");
    if (row.cents > MAX_POSITION_CENTS) fail("value");
    total += row.cents;
  }
  if (total <= 0n) fail("weightSum");
  if (total > MAX_TOTAL_CENTS) fail("value");
  return total;
}

export function deriveWeights(rows: ComparableRow[]): WeightInput[] {
  const total = validateRows(rows);
  const base: number[] = [];
  const remainder: bigint[] = [];
  let assigned = 0;
  for (const row of rows) {
    const raw = row.cents * BPS_PER_UNIT;
    base.push(Number(raw / total));
    remainder.push(raw % total);
    assigned += base[base.length - 1];
  }
  const order = rows
    .map((_, index) => index)
    .sort((left, right) =>
      remainder[left] === remainder[right]
        ? left - right
        : remainder[left] > remainder[right]
          ? -1
          : 1,
    );
  let leftover = 10000 - assigned;
  for (let index = 0; leftover > 0; index += 1, leftover -= 1) {
    base[order[index % order.length]] += 1;
  }
  return rows.map((row, index) => ({
    id: row.id,
    weight: bpsToWeightString(base[index]),
  }));
}

export function evenWeights(rows: ComparableRow[]): WeightInput[] {
  validateRows(rows);
  const count = rows.length;
  const base = Math.floor(10000 / count);
  const remainder = 10000 - base * count;
  return rows.map((row, index) => ({
    id: row.id,
    weight: bpsToWeightString(base + (index < remainder ? 1 : 0)),
  }));
}

export type ParsedWeight = { id: string; bps: number };

export function parseWeights(
  rows: ComparableRow[],
  weights: WeightInput[],
): ParsedWeight[] {
  validateRows(rows);
  if (!Array.isArray(weights) || weights.length !== rows.length) fail("positions");
  const parsed: ParsedWeight[] = [];
  let sum = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const weight = weights[index];
    if (
      typeof weight !== "object" ||
      weight === null ||
      Array.isArray(weight) ||
      typeof weight.id !== "string" ||
      weight.id !== row.id
    )
      fail("identity");
    if (typeof weight.weight !== "string") fail("weightValue");
    const bps = parseWeightBps(weight.weight);
    sum += bps;
    parsed.push({ id: row.id, bps });
  }
  if (sum !== 10000) fail("weightSum");
  return parsed;
}

export function allocateCents(
  total: bigint,
  parsed: ParsedWeight[],
): bigint[] {
  if (
    typeof total !== "bigint" ||
    total < 0n ||
    total > MAX_TOTAL_CENTS
  )
    fail("value");
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > MAX_POSITIONS)
    fail("positions");
  const seen = new Set<string>();
  const base: bigint[] = [];
  const remainder: bigint[] = [];
  let sumBps = 0;
  let assigned = 0n;
  for (const weight of parsed) {
    if (
      typeof weight !== "object" ||
      weight === null ||
      Array.isArray(weight) ||
      typeof weight.id !== "string" ||
      weight.id.trim().length === 0
    )
      fail("identity");
    if (seen.has(weight.id)) fail("identity");
    seen.add(weight.id);
    if (!Number.isInteger(weight.bps) || weight.bps < 0 || weight.bps > 10000)
      fail("weightValue");
    sumBps += weight.bps;
    const raw = total * BigInt(weight.bps);
    const value = raw / BPS_PER_UNIT;
    base.push(value);
    remainder.push(raw % BPS_PER_UNIT);
    assigned += value;
  }
  if (sumBps !== 10000) fail("weightSum");
  const leftover = total - assigned;
  if (leftover >= BigInt(parsed.length) || leftover < 0n) fail("weightSum");
  const order = parsed
    .map((_, index) => index)
    .sort((left, right) =>
      remainder[left] === remainder[right]
        ? left - right
        : remainder[left] > remainder[right]
          ? -1
          : 1,
    );
  for (let index = 0; index < Number(leftover); index += 1) {
    base[order[index]] += 1n;
  }
  return base;
}

export function compareAllocations(
  rows: ComparableRow[],
  weights: WeightInput[],
): Comparison {
  const total = validateRows(rows);
  const parsed = parseWeights(rows, weights);
  const allocated = allocateCents(total, parsed);
  return {
    totalCents: total,
    rows: rows.map((row, index) => {
      const currentBps = toBps(row.cents, total);
      const proposedBps = parsed[index].bps;
      return {
        id: row.id,
        label: row.label,
        currentCents: row.cents,
        proposedCents: allocated[index],
        currentBps,
        proposedBps,
        deltaCents: allocated[index] - row.cents,
        deltaBps: proposedBps - currentBps,
      };
    }),
  };
}

export function outcomeComparison(
  comparison: Comparison,
  currentAfter: Map<string, bigint>,
  proposedAfter: Map<string, bigint>,
): OutcomeComparison {
  let currentTotal = 0n;
  let proposedTotal = 0n;
  let largest: OutcomeRow | null = null;
  const rows = comparison.rows.map((row) => {
    const before = currentAfter.get(row.id);
    const after = proposedAfter.get(row.id);
    if (before === undefined || after === undefined) fail("identity");
    currentTotal += before;
    proposedTotal += after;
    const scenarioDeltaCurrent = before - row.currentCents;
    const scenarioDeltaProposed = after - row.proposedCents;
    const value: OutcomeRow = {
      ...row,
      currentAfter: before,
      proposedAfter: after,
      scenarioDeltaCurrent,
      scenarioDeltaProposed,
      plDelta: scenarioDeltaProposed - scenarioDeltaCurrent,
    };
    if (
      largest === null ||
      (value.plDelta < 0n ? -value.plDelta : value.plDelta) >
        (largest.plDelta < 0n ? -largest.plDelta : largest.plDelta)
    )
      largest = value;
    return value;
  });
  return {
    currentAfter: currentTotal,
    proposedAfter: proposedTotal,
    difference: proposedTotal - currentTotal,
    rows,
    largest,
  };
}

export function rowsFromScenario(
  scenarioRows: Array<{ id: string; after: bigint }>,
): Map<string, bigint> {
  const map = new Map<string, bigint>();
  for (const row of scenarioRows) map.set(row.id, row.after);
  return map;
}
