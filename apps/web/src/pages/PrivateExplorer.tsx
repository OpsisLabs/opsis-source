import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link } from "react-router";
import {
  CheckCircle2,
  DatabaseZap,
  EyeOff,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { AnswerCard, ResolvingAnswerCard } from "../dashboard/ChatPage";
import { classify, SAMPLE_TX, SAMPLE_WALLET } from "../dashboard/api";
import { ApiError } from "../dashboard/http";
import type { ChatSession } from "../dashboard/types";
import { analyzePrivate, type PrivateAnalysis } from "../private/api";
import { WorkspaceDisclosure } from "../product/WorkspaceDisclosure";
import { useLocalHistory } from "../private/useLocalHistory";
import { LocalHistory, SavedConversation } from "../private/LocalHistory";
import type { VaultConversationTurn } from "../vault/types";
import OfficialContract from "../product/OfficialContract";
import { useI18n } from "../i18n";

const PROMPTS = [
  "explorer.prompts.beginner",
  "explorer.prompts.risk",
  "explorer.prompts.activity",
] as const;

export default function PrivateExplorer() {
  const { t } = useI18n();
  const [entityInput, setEntityInput] = useState("");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<PrivateAnalysis | null>(null);
  const [pendingEntity, setPendingEntity] = useState<ChatSession["entity"]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pendingRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const retryTurn = useRef<VaultConversationTurn | null>(null);
  const clearPrivateMemory = useCallback(() => {
    requestRef.current?.abort();
    setEntityInput("");
    setQuestion("");
    setResult(null);
    setPendingEntity(undefined);
    setConversationId(null);
    setSaveError("");
    setError("");
    setLoading(false);
    pendingRef.current = false;
    retryTurn.current = null;
  }, []);
  const history = useLocalHistory(clearPrivateMemory);
  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    [],
  );
  const selectedConversation = history.conversations.find(
    (item) => item.id === conversationId,
  );

  const run = async (event?: FormEvent) => {
    event?.preventDefault();
    const value = entityInput.trim();
    if (!value || pendingRef.current) return;
    const identified = classify(value);
    if (
      identified.type === "unknown" ||
      identified.id.toLowerCase() !== value.toLowerCase()
    ) {
      setError(t("explorer.error.invalidEntity"));
      return;
    }
    pendingRef.current = true;
    const controller = new AbortController();
    requestRef.current = controller;
    const expected = history.generation.current;
    const shouldSave = history.phase === "unlocked";
    const submittedQuestion = question.trim();
    setSaveError("");
    retryTurn.current = null;
    setLoading(true);
    setError("");
    setResult(null);
    setPendingEntity({
      type: identified.type,
      chainId: identified.chainId,
      id: identified.id,
    });
    try {
      const response = await analyzePrivate(
        {
          entity: identified.id,
          entityType:
            identified.type === "transaction" ? "transaction" : "unknown",
          ...(submittedQuestion ? { question: submittedQuestion } : {}),
        },
        controller.signal,
      );
      if (controller.signal.aborted || history.generation.current !== expected)
        return;
      setResult(response);
      if (shouldSave) {
        const turn: VaultConversationTurn = {
          question: submittedQuestion,
          entity: identified.id,
          answer: response.answer.answer,
          bullets: response.answer.summaryBullets,
          sources: response.answer.citations.map((source) => ({
            label: source.label || source.provider,
            url: source.url,
            fetchedAt: source.fetchedAt,
          })),
          savedAt: new Date().toISOString(),
        };
        try {
          setConversationId(await history.save(turn, conversationId, expected));
        } catch (cause) {
          if (history.generation.current !== expected) return;
          retryTurn.current = turn;
          setSaveError(
            t("explorer.error.saveFailed", {
              reason:
                cause instanceof Error
                  ? cause.message
                  : t("explorer.error.localStorageFailed"),
            }),
          );
        }
      }
    } catch (requestError) {
      if (controller.signal.aborted || history.generation.current !== expected)
        return;
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : t("explorer.error.providersUnavailable"),
      );
    } finally {
      if (requestRef.current === controller) {
        pendingRef.current = false;
        setLoading(false);
        setPendingEntity(undefined);
      }
    }
  };

  const chooseEntity = (value: string) => {
    setEntityInput(value);
    setResult(null);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const clear = () => {
    setEntityInput("");
    setQuestion("");
    setResult(null);
    setError("");
    setConversationId(null);
    setSaveError("");
    retryTurn.current = null;
  };

  return (
    <div className="min-h-screen bg-[#1d1d1d] text-[#e9e0d1]">
      <header className="sticky top-0 z-30 flex h-[64px] items-center border-b border-[#2e2e2e] bg-[#1d1d1d]/95 px-4 backdrop-blur sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-3"
          aria-label={t("explorer.header.home")}
        >
          <span
            className="flex h-9 w-9 items-center justify-center bg-[#fa6c34]"
            style={{ clipPath: "polygon(0 0,100% 0,100% 72%,72% 100%,0 100%)" }}
          >
            <img src="/logo.svg" alt="" className="h-5 w-5" />
          </span>
          <span className="hidden font-mono-d text-[11px] tracking-[0.14em] text-[#d6ccba] sm:block">
            CHAINSCOUT
          </span>
        </Link>
        <div className="mx-auto flex items-center gap-2 font-mono-d text-[9.5px] tracking-[0.14em] text-[#7fb069] sm:text-[10.5px]">
          <ShieldCheck size={13} /> {t("explorer.header.privateMode")}
        </div>
        <div className="flex items-center gap-3 sm:gap-5">
          <Link
            to="/vault"
            className="font-mono-d text-[9px] tracking-wider text-[#d6ccba] transition-colors hover:text-[#fa6c34] sm:text-[10px]"
          >
            {t("explorer.header.localVault")}
          </Link>
          <a
            href="#local-history"
            className="font-mono-d text-[10px] text-[#ff985e]"
          >
            {t("explorer.header.localChats")}
          </a>
        </div>
      </header>

      <OfficialContract />

      <main className="workspace-layout">
        <section className="workspace-heading">
          <div>
            <p className="workspace-eyebrow">
              <Search size={14} /> {t("explorer.eyebrow")}
            </p>
            <h1 className="workspace-title">
              {t("explorer.title.line1")}
              <br />
              <span className="text-[#d6ccba]">
                {t("explorer.title.line2")}
              </span>
            </h1>
            <p className="workspace-description">{t("explorer.description")}</p>
          </div>
          <WorkspaceDisclosure
            title={t("explorer.privacy.title")}
            className="workspace-privacy-details"
          >
            <div className="grid grid-cols-2 gap-px bg-[#383838]">
              <PrivacyTile
                icon={<LockKeyhole size={14} />}
                label={t("explorer.privacy.account.label")}
                value={t("explorer.privacy.account.value")}
              />
              <PrivacyTile
                icon={<EyeOff size={14} />}
                label={t("explorer.privacy.aiUpload.label")}
                value={t("explorer.privacy.aiUpload.value")}
              />
              <PrivacyTile
                icon={<DatabaseZap size={14} />}
                label={t("explorer.privacy.serverHistory.label")}
                value={t("explorer.privacy.serverHistory.value")}
              />
              <PrivacyTile
                icon={<Trash2 size={14} />}
                label={t("explorer.privacy.localHistory.label")}
                value={
                  history.phase === "unlocked"
                    ? t("explorer.privacy.localHistory.encrypted")
                    : t("explorer.privacy.localHistory.unsaved")
                }
              />
            </div>
          </WorkspaceDisclosure>
        </section>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div
            id="local-history"
            className="min-w-0 scroll-mt-24 xl:col-start-2 xl:row-start-1"
          >
            <LocalHistory
              key={history.lockEpoch}
              history={history}
              selected={conversationId}
              pending={loading}
              onNew={clear}
              onSelect={(conversation) => {
                setConversationId(conversation.id);
                setResult(null);
                setError("");
                setSaveError("");
                retryTurn.current = null;
                setEntityInput(conversation.turns.at(-1)?.entity ?? "");
                setQuestion("");
              }}
            />
          </div>
          <div className="min-w-0 xl:col-start-1 xl:row-start-1">
            {selectedConversation && !result && (
              <SavedConversation conversation={selectedConversation} />
            )}
            <form
              onSubmit={run}
              className="clip-panel explorer-form border border-[#383838] bg-[#242424]"
            >
              <div className="flex items-center gap-2.5 border-b border-[#383838] px-5 py-4 sm:px-6">
                <Search size={14} className="text-[#fa6c34]" />
                <span className="font-mono-d text-[10.5px] tracking-[0.15em] text-[#d6ccba]">
                  {t("explorer.form.title")}
                </span>
                <span className="ml-auto font-mono-d text-[9px] tracking-wider text-[#635d5a]">
                  {t("explorer.form.network")}
                </span>
              </div>
              <div className="grid gap-0 lg:grid-cols-[1fr_0.72fr]">
                <label className="border-b border-[#383838] p-5 lg:border-b-0 lg:border-r sm:p-6">
                  <span className="font-mono-d text-[9.5px] tracking-[0.14em] text-[#635d5a]">
                    {t("explorer.form.addressLabel")}
                  </span>
                  <input
                    value={entityInput}
                    onChange={(event) => {
                      setEntityInput(event.target.value);
                      if (error) setError("");
                    }}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="0x…"
                    className="mt-3 min-h-12 w-full rounded-sm border border-[#514a45] bg-[#1d1d1d] px-3 font-mono-d text-[16px] text-[#e9e0d1] outline-none placeholder:text-[#aaa39b] focus:border-[#fa6c34]"
                    aria-label={t("explorer.form.addressAria")}
                  />
                </label>
                <label className="p-5 sm:p-6">
                  <span className="font-mono-d text-[9.5px] tracking-[0.14em] text-[#635d5a]">
                    {t("explorer.form.questionLabel")}
                  </span>
                  <input
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    maxLength={500}
                    autoComplete="off"
                    placeholder={t("explorer.form.questionPlaceholder")}
                    className="mt-3 min-h-12 w-full rounded-sm border border-[#514a45] bg-[#1d1d1d] px-3 text-[16px] text-[#e9e0d1] outline-none placeholder:text-[#aaa39b] focus:border-[#fa6c34]"
                    aria-label={t("explorer.form.questionAria")}
                  />
                </label>
              </div>
              <div className="flex flex-col gap-3 border-t border-[#383838] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => chooseEntity(SAMPLE_WALLET)}
                    className="border border-[#383838] px-3 py-2 font-mono-d text-[9px] text-[#7f7972] hover:text-[#e9e0d1]"
                  >
                    {t("explorer.form.sampleWallet")}
                  </button>
                  <button
                    type="button"
                    onClick={() => chooseEntity(SAMPLE_TX)}
                    className="border border-[#383838] px-3 py-2 font-mono-d text-[9px] text-[#7f7972] hover:text-[#e9e0d1]"
                  >
                    {t("explorer.form.sampleTx")}
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={!entityInput.trim() || loading}
                  className="clip-btn-sm flex min-h-[44px] items-center justify-center gap-2 bg-[#fa6c34] px-6 font-mono-d text-[10.5px] font-medium tracking-wider text-[#1d1d1d] disabled:opacity-50"
                >
                  <Sparkles size={13} />{" "}
                  {loading
                    ? t("explorer.form.submitting")
                    : t("explorer.form.submit")}
                </button>
              </div>
            </form>
            <div
              className="mt-4 flex flex-wrap items-center gap-2"
              aria-label={t("explorer.form.examplesAria")}
            >
              <span className="mr-1 text-[14px] text-[#aaa39b]">
                {t("explorer.form.orAsk")}
              </span>
              {PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setQuestion(t(prompt))}
                  className="min-h-11 rounded-sm border border-[#514a45] px-3 py-2 text-[14px] text-[#b8b0a7] transition-colors hover:border-[#fa6c34] hover:text-[#e9e0d1]"
                >
                  {t(prompt)}
                </button>
              ))}
            </div>

            {error && (
              <div
                role="alert"
                className="mt-5 border border-[#e0738a]/40 bg-[#e0738a]/10 px-5 py-4 text-[12.5px] text-[#e0738a]"
              >
                {error}
              </div>
            )}
            {saveError && (
              <div
                role="alert"
                className="mt-5 border border-[#b97864] p-4 text-[#ffabbc]"
              >
                <p>{saveError}</p>
                <button
                  type="button"
                  disabled={
                    loading || history.busy || history.phase !== "unlocked"
                  }
                  className="mt-2 min-h-11 border border-[#b97864] px-3"
                  onClick={async () => {
                    const turn = retryTurn.current;
                    if (!turn || pendingRef.current) return;
                    pendingRef.current = true;
                    setLoading(true);
                    const expected = history.generation.current;
                    try {
                      const id = await history.save(
                        turn,
                        conversationId,
                        expected,
                      );
                      if (expected === history.generation.current) {
                        setConversationId(id);
                        setSaveError("");
                        retryTurn.current = null;
                      }
                    } catch (cause) {
                      if (expected === history.generation.current)
                        setSaveError(
                          t("explorer.error.saveFailed", {
                            reason:
                              cause instanceof Error
                                ? cause.message
                                : t("explorer.error.localStorageFailed"),
                          }),
                        );
                    } finally {
                      pendingRef.current = false;
                      setLoading(false);
                    }
                  }}
                >
                  {t("explorer.error.retrySave")}
                </button>
              </div>
            )}

            <div className="mt-7">
              {loading && <ResolvingAnswerCard entity={pendingEntity} />}
              {result && (
                <div className="space-y-4">
                  <AnswerCard
                    ai={result.answer}
                    onPivot={chooseEntity}
                    animateText
                    eyebrow={t("explorer.answer.eyebrow")}
                  />
                  <section
                    data-testid="privacy-receipt"
                    className="clip-panel border border-[#7fb069]/35 bg-[#7fb069]/5 p-5 sm:p-6"
                  >
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex gap-3">
                        <CheckCircle2
                          size={17}
                          className="mt-0.5 shrink-0 text-[#7fb069]"
                        />
                        <div>
                          <p className="font-mono-d text-[10.5px] tracking-[0.14em] text-[#7fb069]">
                            {t("explorer.receipt.title")}
                          </p>
                          <p className="mt-2 max-w-[720px] text-[12.5px] leading-relaxed text-[#9a938a]">
                            {result.privacy.disclosure}
                          </p>
                          <p className="mt-2 font-mono-d text-[9.5px] text-[#635d5a]">
                            {t("explorer.receipt.destinations", {
                              destinations:
                                result.privacy.providerDestinations.length
                                  ? result.privacy.providerDestinations
                                      .join(" · ")
                                      .toUpperCase()
                                  : t("explorer.receipt.noLiveProvider"),
                            })}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={clear}
                        className="flex shrink-0 items-center gap-2 border border-[#383838] px-4 py-2.5 font-mono-d text-[9.5px] text-[#7f7972] hover:text-[#e9e0d1]"
                      >
                        <Trash2 size={12} /> {t("explorer.receipt.clear")}
                      </button>
                    </div>
                  </section>
                </div>
              )}
              {!loading && !result && !error && !selectedConversation && (
                <div className="workspace-empty mt-6">
                  <Search size={26} className="text-[#fa6c34]" />
                  <h2 className="text-[18px] text-[#e9e0d1]">
                    {t("explorer.empty.title")}
                  </h2>
                  <p>{t("explorer.empty.body")}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function PrivacyTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-[#202020] p-4">
      <div className="flex items-center gap-2 text-[#7fb069]">
        {icon}
        <span className="font-mono-d text-[8.5px] tracking-wider text-[#635d5a]">
          {label}
        </span>
      </div>
      <p className="mt-3 font-mono-d text-[10px] tracking-wider text-[#d6ccba]">
        {value}
      </p>
    </div>
  );
}
