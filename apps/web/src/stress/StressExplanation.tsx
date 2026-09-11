import { useI18n } from "../i18n";
import type { Shock, StressResult } from "./model";

export function StressExplanation({
  result,
  shock,
}: {
  result: StressResult;
  shock: Shock;
}) {
  const { t, locale } = useI18n();
  const pct = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  const money = (value: bigint) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
    }).format(Number(value) / 100);
  const row = result.rows.find((item) => item.id === shock.positionId);
  const weight = shock.scope === "all" ? 100 : (row?.shareBps ?? 0) / 100;
  const direction =
    result.delta < 0n ? "down" : result.delta > 0n ? "up" : "flat";
  const title =
    result.changeBps === 0 && result.delta !== 0n
      ? result.delta < 0n
        ? "stress.why.smallDown"
        : "stress.why.smallUp"
      : (`stress.why.${direction}` as const);
  return (
    <section
      className="stress-explanation"
      aria-labelledby="stress-why-title"
      data-testid="stress-explanation"
    >
      <div>
        <p className="stress-kicker">{t("stress.why.eyebrow")}</p>
        <h2 id="stress-why-title">
          {t(title, {
            percent: pct(Math.abs(result.changeBps) / 100),
          })}
        </h2>
      </div>
      <div>
        <p>
          {shock.percent === 0
            ? t("stress.why.noMove")
            : shock.scope === "all"
              ? t("stress.why.all", {
                  percent: `${shock.percent > 0 ? "+" : ""}${pct(shock.percent)}`,
                })
              : t("stress.why.single", {
                  asset: row?.label ?? "—",
                  weight: pct(weight),
                  percent: `${shock.percent > 0 ? "+" : ""}${pct(shock.percent)}`,
                })}
        </p>
        <p className="stress-equation">
          {t("stress.why.math", {
            affected: money(
              shock.scope === "all" ? result.before : (row?.before ?? 0n),
            ),
            percent: pct(Math.abs(shock.percent)),
            amount: money(result.delta < 0n ? -result.delta : result.delta),
          })}
        </p>
        <p className="stress-rounding">{t("stress.why.rounding")}</p>
      </div>
    </section>
  );
}
