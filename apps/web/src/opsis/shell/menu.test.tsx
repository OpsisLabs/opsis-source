import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import I18nProvider from "../../i18n/I18nProvider";
import WorkspaceShell from "./WorkspaceShell";
import { closeToolMenu, openToolMenu } from "./menu";

it("opens once, focuses the close control, closes and restores trigger focus", () => {
  const focus = vi.fn(),
    trigger = { focus: vi.fn() };
  const dialog = {
    open: false,
    showModal: vi.fn(() => {
      dialog.open = true;
    }),
    close: vi.fn(() => {
      dialog.open = false;
    }),
    querySelector: vi.fn(() => ({ focus })),
  };
  openToolMenu(dialog as unknown as HTMLDialogElement);
  openToolMenu(dialog as unknown as HTMLDialogElement);
  expect(dialog.showModal).toHaveBeenCalledTimes(1);
  expect(focus).toHaveBeenCalledTimes(2);
  closeToolMenu(
    dialog as unknown as HTMLDialogElement,
    trigger as unknown as HTMLButtonElement,
  );
  expect(dialog.close).toHaveBeenCalledTimes(1);
  expect(trigger.focus).toHaveBeenCalledOnce();
  expect(dialog.open).toBe(false);
});
it("renders a named native modal with a closed trigger and a return-home wordmark", () => {
  const html = renderToStaticMarkup(
    <I18nProvider>
      <MemoryRouter>
        <WorkspaceShell
          capabilities={null}
          theme="light"
          locale="en"
          stage="PREVIEW"
          onTheme={() => {}}
          onLocale={() => {}}
        />
      </MemoryRouter>
    </I18nProvider>,
  );
  expect(html).toContain(
    'aria-expanded="false" aria-controls="opsis-tool-menu"',
  );
  expect(html).toContain('<dialog id="opsis-tool-menu"');
  expect(html).toContain('aria-label="Tool menu"');
  expect(html).toContain('href="/"');
  expect(html).toContain(">Opsis</a>");
  expect(html).toContain("Close menu");
  expect(html).not.toContain("<h1");
});
