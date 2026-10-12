import type { Shock, stress } from "./model";
import { translate, type Locale } from "../i18n";

export type Receipt = {
  changeBps: number;
  shockPercent: number;
  scope: "single" | "all";
  affectedBps: number;
  custom: boolean;
  createdAt: string;
  totals: { before: string; after: string } | null;
};

// Export an explicit summary, never positions, private names, addresses or page state.
export function receipt(
  result: ReturnType<typeof stress>,
  shock: Shock,
  custom: boolean,
  includeTotals = false,
  now = new Date(),
): Receipt {
  const affected =
    shock.scope === "all"
      ? 10000
      : result.rows.find((r) => r.id === shock.positionId)?.shareBps;
  if (
    affected === undefined ||
    !Number.isInteger(result.changeBps) ||
    !Number.isFinite(now.getTime())
  )
    throw new Error("Invalid scenario");
  return {
    changeBps: result.changeBps,
    shockPercent: shock.percent,
    scope: shock.scope,
    affectedBps: affected,
    custom,
    createdAt: now.toISOString(),
    totals: includeTotals
      ? { before: result.before.toString(), after: result.after.toString() }
      : null,
  };
}

export async function renderReceipt(
  card: Receipt,
  locale: Locale,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1200;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const t = (
    key: Parameters<typeof translate>[1],
    params?: Parameters<typeof translate>[2],
  ) => translate(locale, key, params);
  const percent = (bps: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
      bps / 100,
    );
  const money = (cents: string) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
    }).format(Number(cents) / 100);
  const text = (
    value: string,
    y: number,
    size: number,
    color = "#eee5d8",
    weight = 500,
  ) => {
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    const width = ctx.measureText(value).width;
    if (width > 1072)
      ctx.font = `${weight} ${(size * 1072) / width}px Arial, sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(value, 64, y);
  };
  ctx.fillStyle = "#1d1d1d";
  ctx.fillRect(0, 0, 1200, 1200);
  ctx.fillStyle = "#fa6c34";
  ctx.fillRect(0, 0, 1200, 112);
  text("OPSIS / STRESS TEST", 74, 36, "#1d1d1d", 700);
  text(t("stress.receipt.hypothetical"), 175, 24, "#d8b778", 600);
  text(
    t(card.scope === "all" ? "stress.receipt.all" : "stress.receipt.single"),
    265,
    42,
  );
  text(
    `${card.shockPercent > 0 ? "+" : ""}${card.shockPercent}%`,
    393,
    116,
    "#fa6c34",
    700,
  );
  text(
    t("stress.receipt.weight", { percent: percent(card.affectedBps) }),
    450,
    29,
    "#c9c0b6",
  );
  ctx.fillStyle = "#292624";
  ctx.fillRect(40, 496, 1120, 230);
  text(t("stress.impact"), 552, 28, "#c9c0b6");
  text(
    `${card.changeBps > 0 ? "+" : ""}${percent(card.changeBps)}%`,
    669,
    107,
    card.changeBps < 0 ? "#ffada3" : "#99d6b3",
    700,
  );
  if (card.totals) {
    text(`${t("stress.before")}: ${money(card.totals.before)}`, 791, 30);
    text(`${t("stress.after")}: ${money(card.totals.after)}`, 844, 30);
  } else text(t("stress.receipt.hidden"), 818, 31, "#c9c0b6");
  text(t(card.custom ? "stress.custom" : "stress.example"), 906, 25, "#d8b778");
  text(t("stress.receipt.notForecast"), 953, 23, "#c9c0b6");
  text(
    card.createdAt.replace("T", " ").replace(/\.\d+Z$/, " UTC"),
    994,
    22,
    "#c9c0b6",
  );
  text(t("stress.receipt.cta"), 1090, 42, "#eee5d8", 700);
  text("www.opsis.net/stress-test", 1148, 32, "#fa6c34");
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Image encoding failed")),
      "image/png",
    ),
  );
}
