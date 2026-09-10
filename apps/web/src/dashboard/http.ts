/**
 * Same-origin API client. Browser credentials live only in Secure, HttpOnly
 * cookies; JavaScript never reads, stores, or serializes either token.
 */

import { dealPreviewAuthorization } from "../deals/preview-token";
const BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const AUTH_REFRESH_LOCK = "chainscout-cookie-refresh";
let refreshPromise: Promise<boolean> | null = null;

/** Remove the pre-cookie implementation's credential bundle without reading
 * or migrating it. Production no longer accepts refresh credentials from JSON,
 * so the removed legacy value cannot be replayed by this browser; its hashed
 * server row expires under the existing retention policy. */
export function clearLegacyBrowserCredentials(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("rh_auth");
}

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

export function humanize(
  code: string,
  message: string,
  status: number,
): string {
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
    case "INVALID_ENTITY":
      return "Enter a complete Robinhood Chain address or transaction hash.";
    case "PRIVATE_MODE_DISABLED":
      return "Private Mode is paused right now. Try again shortly.";
    case "PORTFOLIO_MODE_DISABLED":
      return "Portfolio refresh is paused. Your encrypted local snapshot is still available.";
    case "PORTFOLIO_DAILY_BUDGET_EXCEEDED":
      return "Today's free portfolio refresh budget has been reached. Your prior encrypted snapshot is unchanged.";
    case "PORTFOLIO_BUDGET_UNAVAILABLE":
      return "The free-tier portfolio safety guard is unavailable, so refresh failed closed. Try again shortly.";
    case "RWA_VERIFY_DISABLED":
      return "RWA Verify is paused. No contract data was sent or saved.";
    case "RWA_DAILY_BUDGET_EXCEEDED":
      return "Today's free RWA verification budget has been reached. Try again tomorrow.";
    case "RWA_BUDGET_UNAVAILABLE":
      return "The free-tier RWA safety guard is unavailable, so verification failed closed.";
    case "RWA_ANCHOR_CHANGED":
      return "The current block changed during verification. Nothing was saved; try again.";
    case "RWA_DIRECT_VERIFICATION_FAILED":
      return "The direct contract evidence could not be confirmed at one block. No conclusion was returned.";
    case "COLLECTIBLE_CATALOG_DISABLED":
      return "Catalog matching is paused. You can still add the collectible manually to your encrypted Vault.";
    case "COLLECTIBLE_DAILY_BUDGET_EXCEEDED":
      return "Today's free catalog lookup budget has been reached. You can still add the collectible manually.";
    case "COLLECTIBLE_BUDGET_UNAVAILABLE":
      return "The free catalog safety guard is unavailable, so the lookup failed closed. You can still add the collectible manually.";
    case "COLLECTIBLE_REQUEST_LIMIT_EXCEEDED":
      return "This lookup exceeded ChainScout's catalog request limit. Refine it or add the collectible manually.";
    case "COLLECTIBLE_PROVIDER_RATE_LIMITED":
      return "The free catalog provider is rate-limited. Try again later or add the collectible manually.";
    case "COLLECTIBLE_PROVIDER_UNAVAILABLE":
      return "The collectible catalog is temporarily unavailable. Your encrypted Vault is unchanged, and manual entry still works.";
    case "COLLECTIBLE_PROVIDER_MALFORMED":
      return "The catalog returned data ChainScout could not verify safely. Nothing was saved; use manual entry instead.";
    case "COLLECTIBLE_NOT_FOUND":
      return "That exact catalog card was not found. Adjust the match or add the collectible manually.";
    case "MARKET_INVENTORY_DISABLED":
      return "Live Market & Inventory is paused. Your encrypted comparisons and click-only handoffs still work.";
    case "MARKET_DAILY_BUDGET_EXCEEDED":
      return "Today's free market-data budget has been reached. Your prior encrypted observations are unchanged.";
    case "MARKET_BUDGET_UNAVAILABLE":
      return "The free market-data safety guard is unavailable, so the lookup failed closed.";
    case "MARKET_PROVIDER_RATE_LIMITED":
      return "The public market provider is rate-limited. Your prior encrypted observation is unchanged.";
    case "MARKET_PROVIDER_UNAVAILABLE":
      return "The market provider is unavailable. The approved public identifier may already have been sent; your prior encrypted observation is unchanged.";
    case "MARKET_PROVIDER_MALFORMED":
      return "The provider returned data ChainScout could not verify safely. Nothing new was saved.";
    case "MARKET_MERCHANT_NOT_APPROVED":
    case "MARKET_EXACT_MAPPING_UNAVAILABLE":
      return "No reviewed live merchant mapping exists for that asset. Use the click-only search handoff instead.";
    case "MARKET_EXACT_MAPPING_CHANGED":
      return "That merchant mapping changed after you reviewed it. Reload approved stores and confirm the exact SKU and product ID again.";
    case "SNAPSHOT_REORGED":
      return "The current block anchor changed during verification. Nothing was saved; refresh again.";
    case "VALIDATION_ERROR":
      return /password/i.test(message)
        ? "Password must be at least 10 characters."
        : "That input was not accepted. Check the address or hash and try again.";
    default:
      if (status === 429)
        return "Rate limit reached. Wait a moment and try again.";
      if (status >= 500)
        return "The service is unavailable right now. Try again shortly.";
      return message || "Request failed.";
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody = {};
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // The public error remains bounded even if a proxy returns non-JSON.
  }
  const code = body.error?.code ?? body.code ?? `HTTP_${response.status}`;
  const message = body.error?.message ?? body.message ?? response.statusText;
  return new ApiError(
    code,
    humanize(code, message, response.status),
    response.status,
  );
}

async function raw(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();
  if (init.body) headers.set("content-type", "application/json");
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method))
    headers.set("x-chainscout-csrf", "1");
  return fetch(`${BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
}

async function sessionExists(): Promise<boolean> {
  return (await raw("/v1/auth/me")).ok;
}

async function rotateCookieSession(): Promise<boolean> {
  // Another tab may have completed the single-use refresh while this request
  // was waiting for the Web Lock. Probe before spending it again.
  if (await sessionExists()) return true;
  const response = await raw("/v1/auth/refresh", {
    method: "POST",
    body: "{}",
  });
  return response.ok;
}

async function refreshAfterUnauthorized(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(AUTH_REFRESH_LOCK, rotateCookieSession);
  }
  return rotateCookieSession();
}

async function refresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = refreshAfterUnauthorized().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await raw(path, init);
  if (response.status === 401 && (await refresh()))
    response = await raw(path, init);
  if (response.status === 401)
    throw new ApiError(
      "UNAUTHORIZED",
      "Your session expired. Sign in again.",
      401,
    );
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function publicApi<T>(path: string, body: unknown): Promise<T> {
  const response = await raw(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Cookie-free same-origin request; only the explicit operator-preview scope may attach its temporary test credential. */
export async function privateApi<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const headers = new Headers({
    "content-type": "application/json",
    "x-chainscout-csrf": "1",
  });
  const previewAuthorization = dealPreviewAuthorization(path);
  if (previewAuthorization) headers.set("authorization", previewAuthorization);
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers,
    credentials: "omit",
    signal,
  });
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function downloadAccountExport(): Promise<Blob> {
  return downloadAccountExportAttempt(true);
}

async function downloadAccountExportAttempt(
  canRefresh: boolean,
): Promise<Blob> {
  const response = await raw("/v1/account/export");
  if (response.status === 401 && canRefresh && (await refresh())) {
    return downloadAccountExportAttempt(false);
  }
  if (response.status === 401) {
    throw new ApiError(
      "UNAUTHORIZED",
      "Your session expired. Sign in again.",
      401,
    );
  }
  if (!response.ok) throw await toApiError(response);
  return response.blob();
}
