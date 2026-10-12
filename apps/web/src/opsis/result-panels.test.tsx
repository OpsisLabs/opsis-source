import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import type { ExitCheckQuote } from "../exit-check/api";
import I18nProvider from "../i18n/I18nProvider";
import type { PrivateAnalysis } from "../private/api";
import Research from "./Research";
import TradeCheck from "./TradeCheck";
import type { Capabilities } from "./model";
import { clearPublicSession, publicSession } from "./public-session";
import { fixture, research } from "./test-fixtures";

const TOKEN = fixture().input.contract;
const capabilities: Capabilities = {
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  chainId: 4663,
  research: true,
  tokenControls: true,
  exitCheck: true,
  watch: true,
  rwa: false,
  observedTrades: false,
  perpExecution: false,
};

// A panel that suspends on its own appears about 300 ms after the result, because
// React delays revealing a boundary whose fallback it has just shown. With an empty
// fallback that moves everything below it, and a press already under way on the
// save controls is released over another element. Server rendering emits the
// fallback of a suspended boundary, so these fail if a panel is split off again.
describe("result panels render with their result", () => {
  afterEach(clearPublicSession);

  it("Research includes the evidence map and contract controls in the first render", () => {
    publicSession.research = { entity: TOKEN, task: "overview", entityType: "unknown", result: research() as unknown as PrivateAnalysis };
    const html = renderToStaticMarkup(
      <I18nProvider>
        <MemoryRouter initialEntries={[`/research?entity=${TOKEN}`]}>
          <Research capabilities={capabilities} />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(html).toContain('data-testid="opsis-research-result"');
    expect(html).toContain('class="opsis-evidence-map"');
    expect(html).toContain("Inspect contract controls");
  });

  it("Trade Check includes the pool comparison in the first render", () => {
    publicSession.check = { token: TOKEN, amount: "1.5", output: "WETH", curveEnabled: false, result: fixture() as unknown as ExitCheckQuote };
    const html = renderToStaticMarkup(
      <I18nProvider>
        <MemoryRouter initialEntries={[`/check?token=${TOKEN}`]}>
          <TradeCheck capabilities={capabilities} />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(html).toContain('data-testid="opsis-quote"');
    expect(html).toContain('class="opsis-pool-comparison"');
  });
});
