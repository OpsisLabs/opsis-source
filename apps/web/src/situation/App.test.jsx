import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import App from "./App.jsx";
import LoadFailure from "./LoadFailure";

const state = vi.hoisted(() => ({ chinese: false }));
vi.mock("../opsis/copy", () => ({
  useCopy: () => (en, zh) => (state.chinese ? zh : en),
}));
afterEach(() => {
  state.chinese = false;
});
it("renders the ETH edition and its authored explanations in either language", () => {
  for (const chinese of [false, true]) {
    state.chinese = chinese;
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(html).toContain(chinese ? 'lang="zh-CN"' : 'lang="en"');
    expect(html).toContain(
      chinese ? "这为何与 ETH 有关" : "Why this matters for ETH",
    );
    expect(html).toContain(
      chinese
        ? "此报道不能支持以 ETF 流入解释今日涨势"
        : "This report does not support an ETF-inflow explanation",
    );
    expect(html).toContain(
      chinese ? "9 月 10 日世界资讯归档" : "10 Sep world feed archive",
    );
    expect(html).toContain(
      "Bitcoin ETF outflows accelerate as investors pull $449M in three days",
    );
  }
});

it("renders local recovery instructions in the selected language", () => {
  state.chinese = true;
  const html = renderToStaticMarkup(<LoadFailure />);
  expect(html).toContain("无法加载世界与市场");
  expect(html).toContain("重新加载页面以重试此已发布版本");
  state.chinese = false;
  expect(renderToStaticMarkup(<LoadFailure />)).toContain(
    "Reload World &amp; markets",
  );
});
