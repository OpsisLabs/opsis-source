import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { VaultConversation } from "../vault/types";
import type { useLocalHistory } from "../private/useLocalHistory";
import type { Capabilities } from "./model";
import ReportShelf, { SavedReportList } from "./ReportShelf";

const language = vi.hoisted(() => ({ chinese: false }));
vi.mock("./copy", () => ({
  useCopy: () => (en: string, zh: string) => (language.chinese ? zh : en),
}));
vi.mock("../i18n", async (importOriginal) => {
  const original = await importOriginal<typeof import("../i18n")>();
  return {
    ...original,
    useI18n: () => ({
      locale: language.chinese ? "zh-CN" : "en",
      t: (
        key: Parameters<typeof original.translate>[1],
        params?: Parameters<typeof original.translate>[2],
      ) => original.translate(language.chinese ? "zh-CN" : "en", key, params),
    }),
  };
});
vi.mock("../private/useLocalHistory", () => ({
  useLocalHistory: () => history,
}));
const history = {
  phase: "locked",
  conversations: [],
  generation: { current: 0 },
  lockEpoch: 0,
  busy: false,
} as unknown as ReturnType<typeof useLocalHistory>;
const capabilities: Capabilities = {
  expiresAt: "2026-10-16T12:00:00Z",
  chainId: 4663,
  research: true,
  exitCheck: true,
  watch: true,
  rwa: false,
  observedTrades: false,
  perpExecution: false,
};
const report: VaultConversation = {
  kind: "conversation",
  id: "sample-report",
  title: "Sample observation",
  createdAt: "2026-10-16T10:00:00Z",
  updatedAt: "2026-10-16T10:00:00Z",
  turns: [
    {
      question: "Sample question",
      entity: `0x${"3".repeat(40)}`,
      answer: "Saved evidence",
      bullets: [],
      sources: [],
      savedAt: "2026-10-16T10:00:00Z",
      opsis: { workspace: "check", token: true, chainId: 4663 },
    },
  ],
};

for (const chinese of [false, true]) {
  describe(chinese ? "Chinese Saved panels" : "English Saved panels", () => {
    it("shows the actual Vault state and no report selection while locked", () => {
      language.chinese = chinese;
      history.phase = "locked";
      history.conversations = [];
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <ReportShelf capabilities={capabilities} />
        </MemoryRouter>,
      );
      expect(html).toContain(chinese ? "保险库已锁定" : "Vault locked");
      expect(html).toContain(
        chinese ? "您保存的视角" : "Your saved perspective",
      );
      expect(html).toContain('type="password"');
      expect(html).not.toContain("Sample observation");
      expect(html).not.toContain("<h1");
    });

    it("lays out stored names, type tags, dates and short identifiers with existing backup controls", () => {
      language.chinese = chinese;
      history.phase = "unlocked";
      history.conversations = [report];
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <SavedReportList
            history={history}
            selected={report.id}
            onSelect={() => {}}
            onNew={() => {}}
            pending={false}
          />
        </MemoryRouter>,
      );
      expect(html).toContain("Sample observation");
      expect(html).toContain(chinese ? "交易核查" : "Trade check");
      expect(html).toContain("0x333333…3333");
      expect(html).toContain('aria-current="true"');
      expect(html).not.toContain('type="password"');
      const shelf = renderToStaticMarkup(
        <MemoryRouter>
          <ReportShelf capabilities={capabilities} />
        </MemoryRouter>,
      );
      expect(shelf).toContain(
        chinese ? "保险库已解锁 · 此设备" : "Vault unlocked · this device",
      );
      expect(shelf).toContain(
        chinese ? "导出加密备份" : "Export encrypted backup",
      );
    });
  });
}
