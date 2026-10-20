import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import I18nProvider from "../i18n/I18nProvider";
import { ReceiveBox } from "../pages/SwapPreview";

const render = (amount: string | null, stale = false) =>
  renderToStaticMarkup(<I18nProvider><ReceiveBox symbol="USDG" amount={amount} stale={stale} /></I18nProvider>);

describe("swap receive box", () => {
  it("shows the placeholder before a quote and after an edit clears it", () => {
    const html = render(null);
    expect(html).toContain("Calculated live");
    expect(html).toContain("YOU RECEIVE");
    expect(html).not.toContain("ESTIMATE");
  });

  it("shows the quoted output as an estimate after a successful quote", () => {
    const html = render("238.147595");
    expect(html).toContain("238.147595");
    expect(html).toContain("YOU RECEIVE · ESTIMATE");
    expect(html).not.toContain("Calculated live");
  });

  it("labels an expired quote's output as an expired estimate, never as current", () => {
    const html = render("238.147595", true);
    expect(html).toContain("YOU RECEIVE · EXPIRED ESTIMATE");
    expect(html).toContain("238.147595");
  });
});
