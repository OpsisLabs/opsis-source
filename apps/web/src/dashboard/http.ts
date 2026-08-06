/**
 * Thin fetch wrapper for the @rh-chain/api backend.
 *
 * Holds the JWT pair, attaches the bearer token, and transparently rotates a
 * stale access token via /v1/auth/refresh before retrying a 401 once.
 */

const BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const AUTH_KEY = "rh_auth";
const AUTH_EVENT = "rh-auth-change";
let refreshPromise: Promise<boolean> | null = null;

export interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email?: string | null; username?: string | null; walletAddress?: string | null };
}

export function readAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

export function writeAuth(auth: StoredAuth | null): void {
  if (auth) localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  else localStorage.removeItem(AUTH_KEY);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_EVENT));
}

/** Keep React auth state aligned when the HTTP layer rotates or clears tokens. */
export function subscribeAuth(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(AUTH_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(AUTH_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

/** Error carrying the backend's machine-readable code, e.g. MONTHLY_QUOTA_EXCEEDED. */
export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
  code?: string;
  message?: string;
}

/**
 * The API surfaces zod failures as validation errors whose message is not
 * presentable. Map the codes the UI can actually provoke onto plain sentences.
 */
function humanize(code: string, message: string, status: number): string {
  switch (code) {
    case "INVALID_CREDENTIALS":
      return "Invalid credentials. Check your email and password.";
    case "EMAIL_ALREADY_REGISTERED":
      return "That email is already registered. Try signing in instead.";
    case "EMAIL_NOT_VERIFIED":
      return "Verify your email address before signing in.";
    case "MONTHLY_QUOTA_EXCEEDED":
      return "Monthly quota reached. Usage resets at the start of next month.";
    case "ENTITY_REQUIRED":
      return "Add a wallet address or transaction hash to this question.";
    case "VALIDATION_ERROR":
      // The only validation the forms can trip is the 10-character password floor.
      return /password/i.test(message)
        ? "Password must be at least 10 characters."
        : "That input was not accepted. Check the address or hash and try again.";
    default:
      if (status === 429) return "Rate limit reached. Wait a moment and try again.";
      if (status >= 500) return "The service is unavailable right now. Try again shortly.";
      return message || "Request failed.";
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody = {};
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    /* non-JSON error body */
  }
  const code = body.error?.code ?? body.code ?? `HTTP_${response.status}`;
  const message = body.error?.message ?? body.message ?? response.statusText;
  return new ApiError(code, humanize(code, message, response.status), response.status);
}

async function raw(path: string, init: RequestInit, token?: string): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(`${BASE}${path}`, { ...init, headers });
}

/** Exchange the refresh token for a new pair. Returns false when it is spent. */
async function rotateRefreshToken(): Promise<boolean> {
  const auth = readAuth();
  if (!auth?.refreshToken) return false;
  const response = await raw("/v1/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken: auth.refreshToken }),
  });
  if (!response.ok) {
    writeAuth(null);
    return false;
  }
  const next = (await response.json()) as {
    user: StoredAuth["user"];
    accessToken: string;
    refreshToken: string;
  };
  writeAuth({
    accessToken: next.accessToken,
    refreshToken: next.refreshToken,
    user: {
      id: next.user.id,
      email: next.user.email ?? null,
      username: next.user.username ?? null,
      walletAddress: next.user.walletAddress ?? null,
    },
  });
  return true;
}

async function refresh(): Promise<boolean> {
  // Session bootstrap performs several authenticated requests concurrently.
  // A refresh token is single-use, so every 401 must await the same rotation
  // instead of spending the token twice and clearing the successful result.
  if (!refreshPromise) {
    refreshPromise = rotateRefreshToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/** Authenticated request. Refreshes once on 401 before giving up. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await raw(path, init, readAuth()?.accessToken);

  if (response.status === 401 && (await refresh())) {
    response = await raw(path, init, readAuth()?.accessToken);
  }
  if (response.status === 401) {
    writeAuth(null);
    throw new ApiError("UNAUTHORIZED", "Your session expired. Sign in again.", 401);
  }
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Unauthenticated request, for the auth endpoints themselves. */
export async function publicApi<T>(path: string, body: unknown): Promise<T> {
  const response = await raw(path, { method: "POST", body: JSON.stringify(body) });
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as T;
}
