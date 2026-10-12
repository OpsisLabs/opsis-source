import { useLocation } from "react-router";
import { useCopy } from "./copy";
import { toolGuides } from "./tool-guide";
import type { Capabilities } from "./model";
export default function ToolOrientation({
  capabilities,
}: {
  capabilities: Capabilities;
}) {
  const { pathname } = useLocation(),
    c = useCopy();
  const tool = toolGuides.find((t) => t.path === pathname);
  if (!tool || !tool.enabled(capabilities)) return null;
  return (
    <aside
      className="opsis-tool-orientation"
      aria-label={c("Who this tool is for", "此工具适用人群")}
    >
      <details>
        <summary>
          {c("Who it helps · input · output", "适用人群 · 输入 · 输出")}
        </summary>
        <dl>
          <div>
            <dt>{c("Good for", "适合")}</dt>
            <dd>{c(...tool.audience)}</dd>
          </div>
          <div>
            <dt>{c("Start with", "从这里开始")}</dt>
            <dd>{c(...tool.input)}</dd>
          </div>
          <div>
            <dt>{c("You'll get", "您将得到")}</dt>
            <dd>{c(...tool.outcome)}</dd>
          </div>
        </dl>
      </details>
    </aside>
  );
}
