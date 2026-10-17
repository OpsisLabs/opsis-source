import { useCopy } from "../opsis/copy";

export default function LoadFailure() {
  const c = useCopy();
  return (
    <section
      role="alert"
      className="m-6 border border-[var(--line)] p-6 text-[var(--ink)]"
    >
      <h1 className="text-xl">
        {c("World & markets could not load", "无法加载世界与市场")}
      </h1>
      <p className="my-3">
        {c(
          "Reload the page to retry this published edition.",
          "重新加载页面以重试此已发布版本。",
        )}
      </p>
      <button
        className="border border-[var(--line)] px-4 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        onClick={() => window.location.reload()}
      >
        {c("Reload World & markets", "重新加载世界与市场")}
      </button>
    </section>
  );
}
