import { OPSIS_PRESENTATION } from "../opsis/presentation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { publicIdentity, workspaceLink } from "../opsis/model";
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
import { classify, EXPLORER, SAMPLE_TX, SAMPLE_WALLET } from "../dashboard/api";
import { ApiError } from "../dashboard/http";
import type { ChainEntityType, ChatSession, ExplorerAnswerTask } from "../dashboard/types";
import { analyzePrivate, type PrivateAnalysis } from "../private/api";
import { goalsForEntity, type ExplorerGoal } from "../private/goals";
import { FollowWalletAction } from "../watch/FollowWalletAction";
import {
  FOLLOW_PARTICIPANT_LIMIT,
  collectTransactionParticipants,
  toFollowableWallet,
  type FollowableParticipant,
  type FollowableWallet,
} from "../watch/followWallet";
import { isProductFeatureEnabled } from "../product/availability";
import { WorkspaceDisclosure } from "../product/WorkspaceDisclosure";
import { useLocalHistory } from "../private/useLocalHistory";
import { LocalHistory, SavedConversation } from "../private/LocalHistory";
import type { VaultConversationTurn } from "../vault/types";
import { useI18n } from "../i18n";
import { detailedWidgets } from "../private/detailedWidgets";
import "../private/details.css";

/**
 * The followable public addresses the current answer actually shows: the wallet
 * entity itself, or the participants of a transaction. Contract-typed results
 * and explicitly contract-classified addresses are excluded by the follow
 * contract, and unknown participants stay honest public addresses.
 */
function followTargetsFor(result: PrivateAnalysis): {
  primary: FollowableWallet | null;
  participants: FollowableParticipant[];
} {
  const kind = result.answer.card?.kind ?? result.entity.type;
  const classification =
    kind === "wallet" ? "wallet" : kind === "contract" ? "contract" : "unknown";
  const primary =
    result.entity.type === "wallet"
      ? toFollowableWallet({
          address: result.entity.value,
          chainId: result.entity.chainId,
          classification,
        })
      : null;
  const participants =
    kind === "transaction"
      ? collectTransactionParticipants(result.entity.facts, {
          chainId: result.entity.chainId,
        })
      : [];
  return { primary, participants };
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function PrivateExplorer() {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [entityInput, setEntityInput] = useState(() => OPSIS_PRESENTATION ? publicIdentity(new URLSearchParams(location.search).get("entity")) : "");
  const [question, setQuestion] = useState("");
  const [questionSource, setQuestionSource] = useState<"goal" | "freeform">("freeform");
  const [task, setTask] = useState<ExplorerAnswerTask | undefined>(undefined);
  const [result, setResult] = useState<PrivateAnalysis | null>(null);
  // Kept independently of `result` so resolved-type goals survive a goal pick
  // that clears the displayed answer, and are dropped when the identifier changes.
  const [resolved, setResolved] = useState<{ value: string; type: ChainEntityType } | null>(null);
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
    setQuestionSource("freeform");
    setTask(undefined);
    setResult(null);
    setResolved(null);
    setPendingEntity(undefined);
    setConversationId(null);
    setSaveError("");
    setError("");
    setLoading(false);
    pendingRef.current = false;
    retryTurn.current = null;
  }, []);
  const history = useLocalHistory(clearPrivateMemory);
  const cancelPending = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    pendingRef.current = false;
    setLoading(false);
    setPendingEntity(undefined);
  }, []);
  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    [],
  );
  const selectedConversation = history.conversations.find(
    (item) => item.id === conversationId,
  );

  const run = async (
    event?: FormEvent,
    override?: { value?: string; asked?: string; task?: ExplorerAnswerTask },
  ) => {
    event?.preventDefault();
    const value = (override?.value ?? entityInput).trim();
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
    const submittedQuestion = (override?.asked ?? question).trim();
    const submittedTask = override?.task ?? task;
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
    // Keep the address on the identifier being read, so a reload or shared link opens this lookup.
    if (OPSIS_PRESENTATION) navigate(workspaceLink("/research/details", identified.id), { replace: true });
    try {
      const response = await analyzePrivate(
        {
          entity: identified.id,
          entityType:
            identified.type === "transaction" ? "transaction" : "unknown",
          ...(submittedQuestion ? { question: submittedQuestion } : {}),
          ...(submittedTask ? { task: submittedTask } : {}),
        },
        controller.signal,
      );
      const stale = () =>
        controller.signal.aborted ||
        requestRef.current !== controller ||
        history.generation.current !== expected;
      if (stale()) return;
      setResult(response);
      setResolved({
        value: response.entity.value.toLowerCase(),
        type: response.entity.type,
      });
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
          const id = await history.save(turn, conversationId, expected);
          // A clear or entity edit may have completed while the encrypted write
          // was in flight; the turn is kept, but stale UI state must not return.
          if (stale()) return;
          setConversationId(id);
        } catch (cause) {
          if (stale()) return;
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
    cancelPending();
    setEntityInput(value);
    setQuestion("");
    setQuestionSource("freeform");
    setTask(undefined);
    setResult(null);
    setResolved(null);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const chooseGoal = (goal: ExplorerGoal) => {
    cancelPending();
    setResult(null);
    setTask(goal.task);
    setQuestion(t(goal.labelKey));
    setQuestionSource("goal");
    setError("");
    setSaveError("");
  };

  const runGoal = (goal: ExplorerGoal) => {
    cancelPending();
    setTask(goal.task);
    const asked = t(goal.labelKey);
    setQuestion(asked);
    setQuestionSource("goal");
    void run(undefined, { value: result?.entity.value ?? entityInput, asked, task: goal.task });
  };

  const clear = () => {
    cancelPending();
    setEntityInput("");
    setQuestion("");
    setQuestionSource("freeform");
    setTask(undefined);
    setResult(null);
    setResolved(null);
    setError("");
    setConversationId(null);
    setSaveError("");
    retryTurn.current = null;
  };

  const trimmedInput = entityInput.trim().toLowerCase();
  // Resolved-type goals stay active while the identifier still matches, even
  // after picking a goal cleared the displayed answer.
  const resolvedMatchesInput = resolved !== null && resolved.value === trimmedInput;
  const inputGoals = goalsForEntity(
    resolvedMatchesInput && resolved ? resolved.type : classify(entityInput).type,
  );
  const nextGoals = result ? goalsForEntity(result.entity.type) : [];
  const follow =
    result && isProductFeatureEnabled("watch")
      ? followTargetsFor(result)
      : { primary: null, participants: [] };
  const visibleParticipants = follow.participants.slice(
    0,
    FOLLOW_PARTICIPANT_LIMIT,
  );
  const hasFollow = Boolean(follow.primary) || follow.participants.length > 0;
  const transactionExplorer =
    result && result.entity.type === "transaction"
      ? `${EXPLORER}/tx/${result.entity.value}`
      : null;

  return (
    <div className="min-h-screen bg-[#1d1d1d] text-[#e9e0d1]">
      {!OPSIS_PRESENTATION && (      <header className="sticky top-0 z-30 flex h-[64px] items-center border-b border-[#2e2e2e] bg-[#1d1d1d]/95 px-4 backdrop-blur sm:px-6">
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
            OPSIS
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
      </header>)}


      <main className="workspace-layout">
        <section className="workspace-heading">
          {!OPSIS_PRESENTATION && (<div>
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
          </div>)}
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
                setResolved(null);
                setQuestionSource("freeform");
                setTask(undefined);
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
                      const next = event.target.value;
                      cancelPending();
                      setEntityInput(next);
                      setTask(undefined);
                      setResult(null);
                      if (questionSource === "goal") {
                        setQuestion("");
                        setQuestionSource("freeform");
                      }
                      if (resolved && resolved.value !== next.trim().toLowerCase()) {
                        setResolved(null);
                      }
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
                    onChange={(event) => {
                      cancelPending();
                      setQuestion(event.target.value);
                      setQuestionSource("freeform");
                      setTask(undefined);
                      setResult(null);
                    }}
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
              role="group"
            >
              <span className="mr-1 text-[14px] text-[#aaa39b]">
                {t("explorer.form.orAsk")}
              </span>
              {inputGoals.map((goal) => (
                <button
                  key={goal.task}
                  type="button"
                  onClick={() => chooseGoal(goal)}
                  aria-pressed={task === goal.task}
                  className={`min-h-11 rounded-sm border px-3 py-2 text-[14px] transition-colors hover:border-[#fa6c34] hover:text-[#e9e0d1] ${
                    task === goal.task
                      ? "border-[#fa6c34] text-[#e9e0d1]"
                      : "border-[#514a45] text-[#b8b0a7]"
                  }`}
                >
                  {t(goal.labelKey)}
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
                  {hasFollow && (
                    <section
                      aria-label={t("explorer.follow.title")}
                      className="clip-panel border border-[#fa6c34]/40 bg-[#241d18] p-4 sm:p-5"
                    >
                      <p className="font-mono-d text-[12px] tracking-[0.15em] text-[#ff985e]">
                        {t("explorer.follow.title").toUpperCase()}
                      </p>
                      <p className="mt-2 max-w-[720px] text-[14px] leading-relaxed text-[#b8b0a7]">
                        {t("explorer.follow.body")}
                      </p>
                      {follow.primary && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <FollowWalletAction
                            address={follow.primary.address}
                            chainId={follow.primary.chainId}
                            classification={follow.primary.classification}
                          />
                        </div>
                      )}
                      {follow.participants.length > 0 && (
                        <>
                          <p className="mt-4 font-mono-d text-[12px] tracking-wider text-[#7f7972]">
                            {t("explorer.follow.participants").toUpperCase()}
                          </p>
                          <ul className="mt-2 space-y-1">
                            {visibleParticipants.map((participant) => (
                              <li
                                key={participant.address.toLowerCase()}
                                className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1"
                              >
                                <span
                                  className="font-mono-d text-[14px] text-[#d6ccba]"
                                  title={participant.address}
                                >
                                  {shortAddress(participant.address)}
                                </span>
                                <span className="font-mono-d text-[12px] text-[#7f7972]">
                                  {participant.sides
                                    .map((side) =>
                                      side === "from"
                                        ? t("explorer.follow.from")
                                        : t("explorer.follow.to"),
                                    )
                                    .join(" · ")}
                                </span>
                                <FollowWalletAction
                                  address={participant.address}
                                  chainId={participant.chainId}
                                  classification={participant.classification}
                                  variant="row"
                                />
                              </li>
                            ))}
                          </ul>
                          {follow.participants.length >
                            visibleParticipants.length && (
                            <p className="mt-2 text-[12px] text-[#7f7972]">
                              {t("explorer.follow.more", {
                                shown: visibleParticipants.length,
                                total: follow.participants.length,
                              })}
                            </p>
                          )}
                          {transactionExplorer && (
                            <a
                              className="mt-2 inline-flex min-h-11 items-center text-[12px] text-[#ff985e] underline"
                              href={transactionExplorer}
                              target="_blank"
                              rel="noopener noreferrer"
                              referrerPolicy="no-referrer"
                            >
                              {t("explorer.follow.source")}
                            </a>
                          )}
                        </>
                      )}
                    </section>
                  )}
                  <AnswerCard
                    ai={OPSIS_PRESENTATION ? { ...result.answer, widgets: detailedWidgets(result.entity.facts, result.entity.type) } : result.answer}
                    onPivot={chooseEntity}
                    animateText
                    layout="answer-first"
                    eyebrow={t("explorer.answer.eyebrow")}
                  />
                  <section
                    aria-label={t("explorer.next.title")}
                    className="clip-panel border border-[#383838] bg-[#202020] p-4 sm:p-5"
                  >
                    <p className="font-mono-d text-[10px] tracking-[0.15em] text-[#7f7972]">
                      {t("explorer.next.title").toUpperCase()}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {nextGoals.map((goal) => (
                        <button
                          key={goal.task}
                          type="button"
                          disabled={loading}
                          onClick={() => runGoal(goal)}
                          className="min-h-11 rounded-sm border border-[#514a45] px-3 py-2 text-[14px] text-[#b8b0a7] transition-colors hover:border-[#fa6c34] hover:text-[#e9e0d1] disabled:opacity-50"
                        >
                          {t(goal.labelKey)}
                        </button>
                      ))}
                    </div>
                  </section>
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
