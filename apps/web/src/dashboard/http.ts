/**
 * Same-origin API client. Browser credentials live only in Secure, HttpOnly
 * cookies; JavaScript never reads, stores, or serializes either token.
 */

import { opsisPreviewAuthorization } from "../opsis/preview-token";
import { dealPreviewAuthorization } from "../deals/preview-token";
import { translateCurrent } from "../i18n/translate";
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
      return translateCurrent("cloud.http.invalidCredentials");
    case "EMAIL_ALREADY_REGISTERED":
      return translateCurrent("cloud.http.emailAlreadyRegistered");
    case "EMAIL_NOT_VERIFIED":
      return translateCurrent("cloud.http.emailNotVerified");
    case "MONTHLY_QUOTA_EXCEEDED":
      return translateCurrent("cloud.http.monthlyQuotaExceeded");
    case "ENTITY_REQUIRED":
      return translateCurrent("cloud.http.entityRequired");
    case "INVALID_ENTITY":
      return translateCurrent("cloud.http.invalidEntity");
    case "PRIVATE_MODE_DISABLED":
      return translateCurrent("cloud.http.privateModeDisabled");
    case "PORTFOLIO_MODE_DISABLED":
      return translateCurrent("cloud.http.portfolioModeDisabled");
    case "SCOUT_WATCH_DISABLED":
      return translateCurrent("watch.error.disabled");
    case "PORTFOLIO_DAILY_BUDGET_EXCEEDED":
      return translateCurrent("cloud.http.portfolioDailyBudget");
    case "PORTFOLIO_BUDGET_UNAVAILABLE":
      return translateCurrent("cloud.http.portfolioBudgetUnavailable");
    case "RWA_VERIFY_DISABLED":
      return translateCurrent("cloud.http.rwaVerifyDisabled");
    case "RWA_DAILY_BUDGET_EXCEEDED":
      return translateCurrent("cloud.http.rwaDailyBudget");
    case "RWA_BUDGET_UNAVAILABLE":
      return translateCurrent("cloud.http.rwaBudgetUnavailable");
    case "RWA_ANCHOR_CHANGED":
      return translateCurrent("cloud.http.rwaAnchorChanged");
    case "RWA_DIRECT_VERIFICATION_FAILED":
      return translateCurrent("cloud.http.rwaDirectVerificationFailed");
    case "COLLECTIBLE_CATALOG_DISABLED":
      return translateCurrent("cloud.http.collectibleCatalogDisabled");
    case "COLLECTIBLE_DAILY_BUDGET_EXCEEDED":
      return translateCurrent("cloud.http.collectibleDailyBudget");
    case "COLLECTIBLE_BUDGET_UNAVAILABLE":
      return translateCurrent("cloud.http.collectibleBudgetUnavailable");
    case "COLLECTIBLE_REQUEST_LIMIT_EXCEEDED":
      return translateCurrent("cloud.http.collectibleRequestLimit");
    case "COLLECTIBLE_PROVIDER_RATE_LIMITED":
      return translateCurrent("cloud.http.collectibleProviderRateLimited");
    case "COLLECTIBLE_PROVIDER_UNAVAILABLE":
      return translateCurrent("cloud.http.collectibleProviderUnavailable");
    case "COLLECTIBLE_PROVIDER_MALFORMED":
      return translateCurrent("cloud.http.collectibleProviderMalformed");
    case "COLLECTIBLE_NOT_FOUND":
      return translateCurrent("cloud.http.collectibleNotFound");
    case "MARKET_INVENTORY_DISABLED":
      return translateCurrent("cloud.http.marketInventoryDisabled");
    case "MARKET_DAILY_BUDGET_EXCEEDED":
      return translateCurrent("cloud.http.marketDailyBudget");
    case "MARKET_BUDGET_UNAVAILABLE":
      return translateCurrent("cloud.http.marketBudgetUnavailable");
    case "MARKET_PROVIDER_RATE_LIMITED":
      return translateCurrent("cloud.http.marketProviderRateLimited");
    case "MARKET_PROVIDER_UNAVAILABLE":
      return translateCurrent("cloud.http.marketProviderUnavailable");
    case "MARKET_PROVIDER_MALFORMED":
      return translateCurrent("cloud.http.marketProviderMalformed");
    case "MARKET_MERCHANT_NOT_APPROVED":
    case "MARKET_EXACT_MAPPING_UNAVAILABLE":
      return translateCurrent("cloud.http.marketMerchantNotApproved");
    case "MARKET_EXACT_MAPPING_CHANGED":
      return translateCurrent("cloud.http.marketMappingChanged");
    case "SNAPSHOT_REORGED":
      return translateCurrent("cloud.http.snapshotReorged");
    case "VALIDATION_ERROR":
      return /password/i.test(message)
        ? translateCurrent("cloud.http.passwordTooShort")
        : translateCurrent("cloud.http.validationError");
    default:
      if (status === 429)
        return translateCurrent("cloud.http.rateLimited");
      if (status >= 500)
        return translateCurrent("cloud.http.serviceUnavailable");
      return message || translateCurrent("cloud.http.requestFailed");
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
      translateCurrent("cloud.http.sessionExpired"),
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
  const previewAuthorization = opsisPreviewAuthorization(path) ?? dealPreviewAuthorization(path);
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
      translateCurrent("cloud.http.sessionExpired"),
      401,
    );
  }
  if (!response.ok) throw await toApiError(response);
  return response.blob();
}
