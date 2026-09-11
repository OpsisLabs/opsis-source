import { CENTS_PER_DOLLAR, roundHalfAwayFromZero, toBps } from "./money";
import type { ComparableRow } from "./compare";
import type { Shock } from "./model";

export type MoveInput = { id: string; move: string };
export type MoveErrorCode = "identity" | "moves" | "moveValue";
export type ParsedMove = { id: string; percent: number };

export type ScenarioRow = {
  id: string;
  label: string;
  before: bigint;
  after: bigint;
  delta: bigint;
  shareBps: number;
  contributionBps: number;
};

export type Scenario = {
  before: bigint;
  after: bigint;
  delta: bigint;
  changeBps: number;
  positive: bigint;
  negative: bigint;
  movedCount: number;
  largestShareBps: number;
  largestId: string;
  rows: ScenarioRow[];
};

const MOVE_PATTERN = /^[+-]?\d{1,3}$/;

function fail(code: MoveErrorCode): never {
  throw new Error(code);
}

export function parseMoves(
  rows: ComparableRow[],
  moves: MoveInput[],
): ParsedMove[] {
  if (!Array.isArray(rows) || rows.length === 0) fail("moves");
  if (!Array.isArray(moves) || moves.length !== rows.length) fail("moves");
  const seen = new Set<string>();
  const parsed: ParsedMove[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const move = moves[index];
    if (
      typeof row !== "object" ||
      row === null ||
      typeof row.id !== "string" ||
      row.id.length === 0 ||
      seen.has(row.id)
    )
      fail("identity");
    seen.add(row.id);
    if (typeof move !== "object" || move === null || Array.isArray(move) || move.id !== row.id)
      fail("identity");
    if (typeof move.move !== "string") fail("moveValue");
    if (!MOVE_PATTERN.test(move.move)) fail("moveValue");
    const percent = Number(move.move);
    if (!Number.isInteger(percent) || percent < -100 || percent > 100)
      fail("moveValue");
    parsed.push({ id: row.id, percent });
  }
  return parsed;
}

export function applyMoves(
  rows: ComparableRow[],
  moves: ParsedMove[],
): Scenario {
  if (!Array.isArray(rows) || rows.length === 0) fail("moves");
  if (!Array.isArray(moves) || moves.length !== rows.length) fail("moves");
  let before = 0n;
  let absoluteMovement = 0n;
  let positive = 0n;
  let negative = 0n;
  let movedCount = 0;
  const intermediate = rows.map((row, index) => {
    const move = moves[index];
    if (
      typeof move !== "object" ||
      move === null ||
      move.id !== row.id ||
      !Number.isInteger(move.percent) ||
      move.percent < -100 ||
      move.percent > 100
    )
      fail("moveValue");
    before += row.cents;
    const after = roundHalfAwayFromZero(
      row.cents * (CENTS_PER_DOLLAR + BigInt(move.percent)),
      CENTS_PER_DOLLAR,
    );
    const delta = after - row.cents;
    if (delta !== 0n) movedCount += 1;
    absoluteMovement += delta < 0n ? -delta : delta;
    if (delta > 0n) positive += delta;
    else if (delta < 0n) negative += delta;
    return { row, after, delta };
  });
  let after = 0n;
  for (const item of intermediate) after += item.after;
  let largest = rows[0];
  for (const row of rows) if (row.cents > largest.cents) largest = row;
  return {
    before,
    after,
    delta: after - before,
    changeBps: toBps(after - before, before),
    positive,
    negative,
    movedCount,
    largestShareBps: toBps(largest.cents, before),
    largestId: largest.id,
    rows: intermediate.map(({ row, after: rowAfter, delta }) => ({
      id: row.id,
      label: row.label,
      before: row.cents,
      after: rowAfter,
      delta,
      shareBps: toBps(row.cents, before),
      contributionBps:
        absoluteMovement === 0n
          ? 0
          : toBps(delta < 0n ? -delta : delta, absoluteMovement),
    })),
  };
}

export function shockToMoves(rows: ComparableRow[], shock: Shock): ParsedMove[] {
  if (shock.scope === "all")
    return rows.map((row) => ({ id: row.id, percent: shock.percent }));
  if (shock.scope === "single")
    return rows.map((row) => ({
      id: row.id,
      percent: row.id === shock.positionId ? shock.percent : 0,
    }));
  fail("moves");
}
