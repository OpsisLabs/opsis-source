import type { ExplorerAnswerTask } from "../dashboard/types";
import { useCopy } from "./copy";
export default function ResearchIntro({
  task,
  onSelect,
}: {
  task: ExplorerAnswerTask;
  onSelect: (task: ExplorerAnswerTask) => void;
}) {
  const c = useCopy();
  const tasks: [ExplorerAnswerTask, string, string][] = [
    [
      "overview",
      c("Identity", "身份"),
      c(
        "Resolve the exact token, wallet, contract or transaction.",
        "识别确切的代币、钱包、合约或交易。",
      ),
    ],
    [
      "risk",
      c("Controls", "控制"),
      c(
        "Inspect observed controls and their limits. Missing evidence stays unknown.",
        "检查已观察到的控制及限制。缺失的证据保持未知。",
      ),
    ],
    [
      "activity",
      c("Activity", "活动"),
      c(
        "Read the public activity captured within the provider’s bounded scope.",
        "读取提供商有限范围内采集的公开活动。",
      ),
    ],
    [
      "evidence",
      c("Sources", "来源"),
      c(
        "Trace the answer back to dated observations and original sources.",
        "将答案追溯到注明日期的观察和原始来源。",
      ),
    ],
  ];
  return (
    <section className="opsis-panel opsis-research-intro">
      <p className="opsis-kicker">
        {c(
          "A QUESTION. A TRAIL. A CLEARER PICTURE.",
          "一个问题，一条线索，更清晰的全貌。",
        )}
      </p>
      <div className="opsis-research-diagram" aria-hidden="true">
        <svg viewBox="0 0 500 190">
          <path d="M42 95H170M250 95H454M250 95L325 25H454M250 95L325 165H454" />
          <circle cx="210" cy="95" r="40" />
          <circle cx="210" cy="95" r="27" />
          <path d="M196 95h28m-14-14v28" />
          <circle cx="454" cy="25" r="5" />
          <circle cx="454" cy="95" r="5" />
          <circle cx="454" cy="165" r="5" />
          <rect x="20" y="73" width="44" height="44" />
        </svg>
      </div>
      <h2>{c("Start with the exact identity.", "从确切标识开始。")}</h2>
      <div
        className="opsis-question-switch"
        role="group"
        aria-label={c("Choose a research question", "选择研究问题")}
      >
        {tasks.map(([id, title]) => (
          <button
            key={id}
            aria-pressed={task === id}
            onClick={() => onSelect(id)}
          >
            {title}
          </button>
        ))}
      </div>
      <p aria-live="polite">{tasks.find(([id]) => id === task)?.[2]}</p>
      <p className="opsis-small">
        {c(
          "Choose a question, paste a public identifier, then run research. No observations loaded yet.",
          "选择问题，粘贴公开标识符，然后运行研究。尚未加载观察记录。",
        )}
      </p>
    </section>
  );
}
