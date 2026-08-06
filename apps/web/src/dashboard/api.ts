/**
 * Real backend client. Exposes exactly the surface mockApi.ts did, so the
 * dashboard components consume it without changes.
 */
import { api, ApiError, publicApi, readAuth, writeAuth } from "./http";
import {
  CHAIN_ID,
  EXPLORER,
  adaptEntitySummary,
  adaptMessage,
  adaptSession,
  adaptAnswer,
  errorAnswer,
  type BackendAnswer,
  type BackendEntity,
  type BackendMessage,
  type BackendSession,
} from "./adapters";
import type {
  ChainEntityType,
  ChatMessage,
  ChatSession,
  EntitySummary,
  ResolvedEntity,
  Usage,
  User,
} from "./types";

export { EXPLORER };

/** Addresses the sample buttons load into the search bar. */
export const SAMPLE_WALLET =
  import.meta.env.VITE_SAMPLE_WALLET ?? "0x9c34Fb7b54f05eba5D28Af3fF18f8dD9D66f7292";
export const SAMPLE_TX =
  import.meta.env.VITE_SAMPLE_TX ??
  "0x79ec8bb466286ee463d7e2a91b714a5e09e24d24f9e6cd4a474887b88e27d4df";

/* ---------------- auth ---------------- */

interface AuthResponse {
  user: { id: string; email?: string | null; username?: string | null; walletAddress?: string | null };
  accessToken?: string;
  refreshToken?: string;
  verificationRequired?: boolean;
}

function persist(result: AuthResponse): User {
  if (!result.accessToken || !result.refreshToken) {
    throw new ApiError(
      "EMAIL_VERIFICATION_REQUIRED",
      "Check your inbox to verify this address, then sign in.",
      403,
    );
  }
  const user = {
    id: result.user.id,
    email: result.user.email ?? null,
    username: result.user.username ?? null,
    walletAddress: result.user.walletAddress ?? null,
  };
  writeAuth({ accessToken: result.accessToken, refreshToken: result.refreshToken, user });
  return user;
}

export async function login(email: string, password: string): Promise<User> {
  return persist(await publicApi<AuthResponse>("/v1/auth/login", { email, password }));
}

export async function register(email: string, password: string): Promise<User> {
  return persist(await publicApi<AuthResponse>("/v1/auth/register", { email, password }));
}

/** Thrown when a wallet signs in for the first time and needs to pick a username. */
export const USERNAME_REQUIRED = "USERNAME_REQUIRED";

export interface WalletChallenge {
  address: string;
  nonce: string;
  message: string;
}

/** Step 1: ask the API for a nonce and the exact message to sign. */
export async function walletChallenge(address: string): Promise<WalletChallenge> {
  return publicApi<WalletChallenge>("/v1/auth/wallet/nonce", { address });
}

/**
 * Step 2: exchange a signed nonce for a session. Throws an ApiError with code
 * USERNAME_REQUIRED when the wallet is new — call again with a username, reusing
 * the same nonce and signature so the user is not asked to sign twice.
 */
export async function walletLogin(nonce: string, signature: string, username?: string): Promise<User> {
  const result = await publicApi<AuthResponse>("/v1/auth/wallet/verify", {
    nonce,
    signature,
    ...(username ? { username } : {}),
  });
  return persist(result);
}

export async function logout(): Promise<void> {
  const refreshToken = readAuth()?.refreshToken;
  // Best effort: the local session is cleared even if revocation fails.
  if (refreshToken) {
    try {
      await publicApi("/v1/auth/logout", { refreshToken });
    } catch {
      /* already expired or revoked */
    }
  }
  writeAuth(null);
}

export function currentUser(): User | null {
  return readAuth()?.user ?? null;
}

/* ---------------- usage ---------------- */

export async function getUsage(): Promise<Usage> {
  return api<Usage>("/v1/usage/me");
}

/* ---------------- entities ---------------- */

/**
 * Local classification, kept client-side so the composer can label an entity
 * without spending a chain lookup. The backend re-resolves authoritatively.
 */
export function classify(q: string): ResolvedEntity {
  const value = q.trim();
  const hash = value.match(/0x[a-fA-F0-9]{64}/)?.[0];
  if (hash) return { type: "transaction", chainId: CHAIN_ID, id: hash, explorerUrl: `${EXPLORER}/tx/${hash}` };
  const address = value.match(/0x[a-fA-F0-9]{40}/)?.[0];
  if (address)
    return { type: "wallet", chainId: CHAIN_ID, id: address, explorerUrl: `${EXPLORER}/address/${address}` };
  return { type: "unknown", chainId: CHAIN_ID, id: value, explorerUrl: EXPLORER };
}

/**
 * Resolves the side panel. Returns null when the entity cannot be fetched, so
 * the panel falls back to its empty state instead of the view rejecting.
 */
export async function getEntitySummary(value: string): Promise<EntitySummary | null> {
  const { type, id } = classify(value);
  const path =
    type === "transaction" ? `/v1/transactions/${id}` : `/v1/wallets/${id}/summary`;
  try {
    const { entity } = await api<{ entity: BackendEntity }>(path);
    return adaptEntitySummary(entity);
  } catch (error) {
    console.error("entity summary failed", error);
    return null;
  }
}

/* ---------------- chat ---------------- */

export async function listSessions(): Promise<ChatSession[]> {
  const { sessions } = await api<{ sessions: BackendSession[] }>("/v1/chat/sessions");
  return sessions.map(adaptSession);
}

export async function createSession(title: string, entityId?: string): Promise<ChatSession> {
  // The route reports the resolved entity as {type, chainId, id} alongside the
  // session record, which carries it as {type, value}.
  const created = await api<{
    session: BackendSession;
    entity?: { type: ChainEntityType; chainId: number; id: string } | null;
  }>("/v1/chat/sessions", {
    method: "POST",
    body: JSON.stringify({ title, ...(entityId ? { initialEntity: entityId } : {}) }),
  });
  const activeEntity = created.entity
    ? { type: created.entity.type, value: created.entity.id }
    : created.session.activeEntity;
  return adaptSession({ ...created.session, activeEntity });
}

export async function listMessages(sessionId: string): Promise<ChatMessage[]> {
  const { messages } = await api<{ messages: BackendMessage[] }>(
    `/v1/chat/sessions/${sessionId}/messages`,
  );
  return messages.map((message) => adaptMessage(message));
}

/**
 * Sends a question and returns the assistant reply. Backend failures resolve as
 * an assistant message carrying the reason, because the chat view has no other
 * place to show one and an unresolved promise would strand the composer.
 */
export async function sendMessage(
  sessionId: string,
  message: string,
  entity?: string,
): Promise<ChatMessage> {
  const resolved = entity ? classify(entity) : undefined;
  // A 64-char hash is unambiguously a transaction, but classify() calls every
  // address a wallet — and sending that as entityType overrides the backend's
  // own detection, so token and contract addresses get explained as wallets.
  // Send the value alone and let the API identify what it actually is.
  const body = {
    question: message,
    ...(resolved && resolved.type !== "unknown"
      ? { entity: resolved.id, ...(resolved.type === "transaction" ? { entityType: "transaction" as const } : {}) }
      : {}),
  };

  try {
    const response = await api<{ message: BackendMessage; answer: BackendAnswer } & BackendAnswer>(
      `/v1/chat/sessions/${sessionId}/messages`,
      { method: "POST", body: JSON.stringify(body) },
    );
    // The route spreads the answer and also nests it under `answer`.
    const payload =
      response.answer && typeof response.answer === "object" ? response.answer : response;
    const context = resolved && resolved.type !== "unknown" ? { type: resolved.type, id: resolved.id } : undefined;
    return {
      id: response.message?.id ?? `msg_${Date.now()}`,
      role: "ASSISTANT",
      content: payload.answer ?? "",
      ai: adaptAnswer(payload, context),
      createdAt: response.message?.createdAt ?? new Date().toISOString(),
    };
  } catch (error) {
    const reason =
      error instanceof ApiError
        ? error.message
        : "Could not reach the analysis service. Check that the API is running and try again.";
    return {
      id: `err_${Date.now()}`,
      role: "ASSISTANT",
      content: reason,
      ai: errorAnswer(reason),
      createdAt: new Date().toISOString(),
    };
  }
}
