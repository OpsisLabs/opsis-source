import { z } from "zod";

const DRPC_KEY_PATTERN = /^[A-Za-z0-9._~+/=-]{16,256}$/;

function isCanonicalAppOrigin(value: string, production: boolean): boolean {
  if (/[<>"'\s]/.test(value)) return false;
  try {
    const origin = new URL(value);
    return (origin.protocol === "https:" || (!production && origin.protocol === "http:"))
      && origin.origin === value
      && origin.username === ""
      && origin.password === ""
      && (origin.pathname === "" || origin.pathname === "/")
      && origin.search === ""
      && origin.hash === ""
      && (!production || (origin.hostname !== "localhost"
        && !/^127(?:\.\d{1,3}){3}$/.test(origin.hostname)
        && !["::1", "[::1]"].includes(origin.hostname)));
  } catch {
    return false;
  }
}

const envBoolean = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return value;
}, z.boolean());
const optionalString = z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional());
const optionalEmail = z.preprocess((value) => (value === "" ? undefined : value), z.string().email().optional());
const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional());
const optionalSha = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().regex(/^[0-9a-f]{40}$/i, "deployment SHA must be a full Git commit SHA").optional()
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BUILD_SHA: optionalSha,
  // Railway provides this automatically for Git-triggered deployments. CLI
  // upload candidates set BUILD_SHA explicitly because they have no Git SHA.
  RAILWAY_GIT_COMMIT_SHA: optionalSha,
  PORT: z.coerce.number().int().positive().default(4000),
  APP_ORIGIN: z.string().default("http://localhost:5173"),
  APP_ORIGIN_ALIASES: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || undefined : value),
    z.string().optional()
  ).transform((value) => value?.split(",").map((origin) => origin.trim()) ?? []),
  DATABASE_URL: z.string().optional(),
  CLOUD_WORKSPACE_ENABLED: envBoolean.default(false),
  REDIS_URL: z.string().optional(),
  CHAIN_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  JWT_ACCESS_SECRET: z.string().min(16).default("dev_access_secret_change_me"),
  JWT_REFRESH_SECRET: z.string().min(16).default("dev_refresh_secret_change_me"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("30d"),
  // HTTPS preview environments can exercise the exact production cookie
  // boundary without pretending to have production persistence configured.
  // Production is always secure regardless of this optional override.
  SECURE_SESSION_COOKIES: envBoolean.default(false),
  AI_PROVIDER: z.enum(["auto", "fallback", "ollama", "openai"]).default("auto"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  OPENAI_SUMMARY_MODEL: optionalString,
  OLLAMA_BASE_URL: z.string().url().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().min(1).default("qwen3:4b"),
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  ROBINHOOD_CHAIN_ID: z.coerce.number().int().default(4663),
  ROBINHOOD_EXPLORER_URL: z.string().url().default("https://robinhoodchain.blockscout.com"),
  ROBINHOOD_PUBLIC_RPC_URL: z.string().url().default("https://rpc.mainnet.chain.robinhood.com"),
  // Server-side Robinhood Chain JSON-RPC transport. The official public RPC is
  // development-only under Robinhood's hosted-service terms; production reads
  // use the founder-admitted dRPC gateway (decision D20), with no fallback.
  ROBINHOOD_RPC_PROVIDER: z.enum(["robinhood-public", "drpc"]).default("robinhood-public"),
  DRPC_API_KEY: optionalString,
  DRPC_ROBINHOOD_NETWORK: z.string().regex(/^[a-z0-9-]{1,64}$/).default("robinhood"),
  // Account-wide monthly dRPC compute-unit fuse (about $50 at $0.30 per million CU).
  DRPC_MONTHLY_CU_LIMIT: z.coerce.number().int().min(100_000).max(10_000_000_000).default(166_000_000),
  ENABLE_PUBLIC_RPC_FALLBACK: envBoolean.default(false),
  BLOCKSCOUT_API_BASE_URL: z.string().url().default("https://robinhoodchain.blockscout.com/api/v2"),
  BLOCKSCOUT_API_KEY: optionalString,
  BLOCKSCOUT_PRO_API_BASE_URL: z.string().url().default("https://api.blockscout.com"),
  BLOCKSCOUT_PRO_API_KEY: optionalString,
  BLOCKSCOUT_CHAIN_ID: z.coerce.number().int().default(4663),
  BLOCKSCOUT_REQUESTS_PER_SECOND: z.coerce.number().int().min(1).max(50).default(4),
  BLOCKSCOUT_MAX_WAIT_MS: z.coerce.number().int().min(0).max(10000).default(2500),
  BLOCKSCOUT_CREDIT_RESERVE: z.coerce.number().int().min(0).default(5000),
  BLOCKSCOUT_TOKEN_CACHE_SECONDS: z.coerce.number().int().min(0).max(3600).default(900),
  BLOCKSCOUT_OPTIONAL_WAIT_MS: z.coerce.number().int().min(500).max(10000).default(8000),
  BLOCKSCOUT_MAX_PAGES: z.coerce.number().int().min(1).max(10).default(3),
  ALCHEMY_API_KEY: z.string().optional(),
  ALCHEMY_ROBINHOOD_RPC_URL: optionalUrl,
  ALCHEMY_ROBINHOOD_WS_URL: optionalUrl,
  UNISWAP_QUOTE_ENABLED: envBoolean.default(false),
  SWAP_QUOTE_SOURCE: z.enum(["onchain", "uniswap-api"]).default("onchain"),
  TRADE_SIMULATOR_ENABLED: envBoolean.default(false),
  UNISWAP_API_KEY: optionalString,
  UNISWAP_API_BASE_URL: z.string().url().default("https://trade-api.gateway.uniswap.org/v1"),
  UNISWAP_QUOTE_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(8_000),
  UNISWAP_QUOTE_CACHE_SECONDS: z.coerce.number().int().min(5).max(29).default(15),
  UNISWAP_QUOTE_BUDGET_PER_MINUTE: z.coerce.number().int().min(1).max(120).default(30),
  UNISWAP_QUOTE_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(120).default(20),
  OPEN_DATA_DATASETS_ENABLED: envBoolean.default(false),
  OPEN_DATA_SQL_ENABLED: envBoolean.default(false),
  RECEIPTS_ENABLED: envBoolean.default(false),
  RECEIPT_SIGNING_KEY: z.string().optional(),
  RECEIPT_KEY_VALID_FROM: z.string().datetime().refine((value) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value, "Use a canonical UTC timestamp with milliseconds").default("2026-10-19T00:00:00.000Z"),
  LINKED_WALLETS_ENABLED: envBoolean.default(false),
  LINKED_WALLETS_MAX_EXPLORER_CALLS: z.coerce.number().int().min(1).max(500).default(40),
  LINKED_WALLETS_MAX_RPC_CALLS: z.coerce.number().int().min(10).max(300).default(300),
  LINKED_WALLETS_FUNDING_HOLDERS: z.coerce.number().int().min(1).max(40).default(20),
  LINKED_WALLETS_WALLET_PAGE_CAP: z.coerce.number().int().min(1).max(30).default(4),
  LINKED_WALLETS_DAILY_BUDGET: z.coerce.number().int().min(1).max(100_000).default(20_000),
  LINKED_WALLETS_CACHE_SECONDS: z.coerce.number().int().min(1).max(3600).default(600),
  RATE_LIMIT_LINKED_WALLETS_PER_HOUR: z.coerce.number().int().min(1).max(60).default(5),
  CLAIM_CHECK_ENABLED: envBoolean.default(false),
  CLAIM_CHECK_DAILY_RPC_UNIT_BUDGET: z.coerce.number().int().min(100).max(100_000).default(5_000),
  RATE_LIMIT_CLAIM_CHECK_PER_HOUR: z.coerce.number().int().min(1).max(60).default(10),
  LAUNCH_CARDS_ENABLED: envBoolean.default(false),
  // The sell test stays off until eth_simulateV1 results are verified on the production provider.
  LAUNCH_SELL_TEST_ENABLED: envBoolean.default(false),
  LAUNCH_LOG_WINDOW_BLOCKS: z.coerce.number().int().min(500).max(100_000).default(100_000),
  LAUNCH_CARDS_DAILY_RPC_UNIT_BUDGET: z.coerce.number().int().min(100).max(100_000).default(5_000),
  LAUNCH_CARDS_MAX_RPC_SUBCALLS: z.coerce.number().int().min(40).max(600).default(480),
  LAUNCH_CARDS_FEED_MAX_RPC_SUBCALLS: z.coerce.number().int().min(40).max(300).default(180),
  LAUNCH_CARDS_CACHE_SECONDS: z.coerce.number().int().min(0).max(600).default(60),
  LAUNCH_CARDS_FEED_CACHE_SECONDS: z.coerce.number().int().min(1).max(300).default(60),
  RATE_LIMIT_LAUNCH_CARDS_PER_HOUR: z.coerce.number().int().min(1).max(60).default(10),
  TOKEN_CONTROLS_ENABLED: envBoolean.default(false),
  CONTRACT_FACTS_ENABLED: envBoolean.default(false),
  OPSIS_WORKSPACES_ENABLED: envBoolean.default(false),
  OPSIS_PUBLIC_ACCESS_ENABLED: envBoolean.default(false),
  PERP_HANDOFF_ENABLED: envBoolean.default(false),
  SAVED_CHECK_COMPARISONS_ENABLED: envBoolean.default(false),
  OPSIS_PREVIEW_HASH: optionalString,
  OPSIS_PREVIEW_EXPIRES_AT: optionalString,
  PRIVATE_MODE_ENABLED: envBoolean.default(true),
  PORTFOLIO_MODE_ENABLED: envBoolean.default(false),
  APPROVAL_MANAGER_ENABLED: envBoolean.default(false),
  WATCH_ENABLED: envBoolean.default(false),
  PORTFOLIO_DAILY_RPC_UNIT_BUDGET: z.coerce.number().int().min(100).max(100_000).default(5_000),
  PORTFOLIO_MAX_RPC_SUBCALLS: z.coerce.number().int().min(10).max(100).default(64),
  STOCK_DESK_ENABLED: envBoolean.default(false),
  STOCK_DESK_CACHE_SECONDS: z.coerce.number().int().min(1).max(1800).default(300),
  RWA_VERIFY_ENABLED: envBoolean.default(false),
  RWA_DAILY_RPC_UNIT_BUDGET: z.coerce.number().int().min(100).max(100_000).default(3_000),
  RWA_MAX_RPC_SUBCALLS: z.coerce.number().int().min(8).max(50).default(24),
  EXIT_CHECK_ENABLED: envBoolean.default(false),
  NETWORK_PULSE_ENABLED: envBoolean.default(false),
  EXIT_CHECK_DAILY_RPC_UNIT_BUDGET: z.coerce.number().int().min(100).max(100_000).default(2_000),
  EXIT_CHECK_MAX_RPC_SUBCALLS: z.coerce.number().int().min(4).max(50).default(24),
  COLLECTIBLE_CATALOG_ENABLED: envBoolean.default(false),
  TCGDEX_API_BASE_URL: z.string().url().default("https://api.tcgdex.net/v2"),
  COLLECTIBLE_DAILY_REQUEST_BUDGET: z.coerce.number().int().min(50).max(10_000).default(500),
  MARKET_INVENTORY_ENABLED: envBoolean.default(false),
  COLLECTIBLE_DEAL_FINDER_ENABLED: envBoolean.default(false),
  CARD_PRICE_CHECK_ENABLED: envBoolean.default(false),
  DEAL_FINDER_PREVIEW_HASH: optionalString,
  DEAL_FINDER_PREVIEW_EXPIRES_AT: optionalString,
  MARKET_DAILY_REQUEST_BUDGET: z.coerce.number().int().min(50).max(25_000).default(1_000),
  OBSERVED_TRADES_ENABLED: envBoolean.default(false),
  OBSERVED_TRADES_DAILY_RPC_UNIT_BUDGET: z.coerce.number().int().min(100).max(100_000).default(3_000),
  OBSERVED_TRADES_MAX_RPC_SUBCALLS: z.coerce.number().int().min(8).max(100).default(40),
  OBSERVED_TRADES_MAX_BLOCKS: z.coerce.number().int().min(50).max(1_000).default(1_000),
  OBSERVED_TRADES_MIN_BLOCKS: z.coerce.number().int().min(10).max(500).default(50),
  OBSERVED_TRADES_MAX_LOGS: z.coerce.number().int().min(10).max(10_000).default(1_000),
  OBSERVED_TRADES_TOP_ROWS: z.coerce.number().int().min(1).max(6).default(6),
  PUBLIC_SWAP_HISTORY_ENABLED: envBoolean.default(false),
  OPEN_DATA_API_ENABLED: envBoolean.default(false),
  PUBLIC_CARDS_ENABLED: envBoolean.default(false),
  PUBLIC_CARDS_CACHE_SECONDS: z.coerce.number().int().min(15).max(300).default(60),
  PUBLIC_CARDS_HMAC_SECRET: optionalString,
  PUBLIC_MCP_ENABLED: envBoolean.default(false),
  ALERTS_POLL_SECONDS: z.coerce.number().int().min(3).max(60).default(3),
  ALERTS_ENABLED: envBoolean.default(false),
  ALERTS_BLOCK_TAG: z.enum(["safe", "latest"]).default("safe"),
  ALERTS_ENCRYPTION_KEY: optionalString,
  ALERTS_INDEX_KEY: optionalString,
  ALERTS_DAILY_CALL_BUDGET: z.coerce.number().int().min(1).max(100_000).default(10_000),
  TELEGRAM_BOT_ENABLED: envBoolean.default(false),
  TELEGRAM_BOT_TOKEN: optionalString,
  TELEGRAM_WEBHOOK_SECRET: optionalString,
  OPEN_DATA_DAILY_REQUEST_BUDGET: z.coerce.number().int().min(100).max(100_000).default(10_000),
  // The browser sends a custom header and exact Origin on state-changing
  // account routes. Tests opt in explicitly so legacy bearer-token fixtures
  // can keep exercising the underlying route behavior.
  CSRF_PROTECTION_ENABLED: z.preprocess((v) => (v === "" ? undefined : v), envBoolean.optional()),
  GOLDRUSH_ENABLED: envBoolean.default(false),
  GOLDRUSH_API_KEY: optionalString,
  GOLDRUSH_API_BASE_URL: z.string().url().default("https://api.covalenthq.com/v1"),
  GOLDRUSH_CHAIN_NAME: z.string().min(1).default("robinhood-mainnet"),
  PROVIDER_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  PROVIDER_BACKOFF_MS: z.coerce.number().int().positive().default(150),
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  PROVIDER_CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(5),
  PROVIDER_CIRCUIT_RESET_MS: z.coerce.number().int().positive().default(30_000),
  PROVIDER_REQUEST_BUDGET_PER_MINUTE: z.coerce.number().int().positive().default(120),
  PROVIDER_MAX_CONCURRENCY: z.coerce.number().int().positive().max(50).default(5),
  RATE_LIMIT_ACCESS_PER_MINUTE: z.coerce.number().int().min(20).max(2000).default(240),
  RATE_LIMIT_AUTH_PER_HOUR: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_CHAT_PER_HOUR: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_LOOKUP_PER_HOUR: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WALLET_PER_HOUR: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_PUBLIC_PER_HOUR: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_PORTFOLIO_PER_HOUR: z.coerce.number().int().min(1).max(60).default(10),
  RATE_LIMIT_RWA_PER_HOUR: z.coerce.number().int().min(1).max(60).default(10),
  RATE_LIMIT_EXIT_CHECK_PER_HOUR: z.coerce.number().int().min(1).max(60).default(10),
  RATE_LIMIT_COLLECTIBLE_PER_HOUR: z.coerce.number().int().min(1).max(60).default(10),
  RATE_LIMIT_MARKET_PER_HOUR: z.coerce.number().int().min(1).max(60).default(12),
  RATE_LIMIT_OBSERVED_TRADES_PER_HOUR: z.coerce.number().int().min(1).max(60).default(12),
  RATE_LIMIT_OPEN_DATA_PER_HOUR: z.coerce.number().int().min(1).max(1_000).default(60),
  QUOTA_AI_MESSAGES_PER_MONTH: z.coerce.number().int().positive().default(500),
  QUOTA_CHAIN_LOOKUPS_PER_MONTH: z.coerce.number().int().positive().default(5000),
  // Wallet sign-in needs no email. Turn this on only if email/password signup
  // is re-enabled, which is what makes SMTP mandatory in production.
  AUTH_EMAIL_ENABLED: envBoolean.default(false),
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: envBoolean.default(false),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  EMAIL_FROM: optionalEmail,
  RETENTION_ENABLED: envBoolean.default(true),
  RETENTION_INTERVAL_HOURS: z.coerce.number().positive().max(24).default(24),
  RETENTION_AUTH_DAYS: z.coerce.number().int().positive().max(30).default(30),
  RETENTION_SOURCE_DAYS: z.coerce.number().int().positive().max(90).default(30),
  RETENTION_AUDIT_DAYS: z.coerce.number().int().positive().max(90).default(90),
  RETENTION_USAGE_DAYS: z.coerce.number().int().positive().max(90).default(90),
  RETENTION_CHAT_DAYS: z.coerce.number().int().positive().max(365).default(365),
  LOG_LEVEL: z.string().default("info"),
  ENABLE_METRICS: envBoolean.default(true),
  // Swagger UI is useful in development but advertises the whole surface,
  // including admin routes. Defaults off in production; set true to publish it.
  ENABLE_API_DOCS: z.preprocess((v) => (v === "" ? undefined : v), envBoolean.optional()),
  // When set, /metrics requires this bearer token and 404s otherwise.
  METRICS_TOKEN: optionalString
}).superRefine((env, context) => {
  if (env.NETWORK_PULSE_ENABLED && env.ROBINHOOD_CHAIN_ID !== 4663) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["ROBINHOOD_CHAIN_ID"], message: "Network pulse supports chain 4663 only" });
  }
  if (env.NETWORK_PULSE_ENABLED && env.ROBINHOOD_RPC_PROVIDER === "robinhood-public" && env.NODE_ENV !== "test") {
    const rpc = new URL(env.ROBINHOOD_PUBLIC_RPC_URL);
    if (rpc.origin !== "https://rpc.mainnet.chain.robinhood.com" || !["", "/"].includes(rpc.pathname) || rpc.search || rpc.hash || rpc.username || rpc.password) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["ROBINHOOD_PUBLIC_RPC_URL"], message: "Network pulse requires the existing official Robinhood Chain public RPC in development" });
    }
  }
  if ((env.PUBLIC_CARDS_ENABLED || env.PUBLIC_MCP_ENABLED) && (!env.PUBLIC_CARDS_HMAC_SECRET || Buffer.byteLength(env.PUBLIC_CARDS_HMAC_SECRET) < 32)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["PUBLIC_CARDS_HMAC_SECRET"], message: "Public cards and MCP require an HMAC secret of at least 32 bytes" });
  }
  if (env.ALERTS_ENABLED) {
    if (!env.TELEGRAM_BOT_ENABLED) context.addIssue({ code: z.ZodIssueCode.custom, path: ["ALERTS_ENABLED"], message: "Alerts require the configured Telegram bot" });
    for (const field of ["ALERTS_ENCRYPTION_KEY", "ALERTS_INDEX_KEY"] as const) {
      if (!env[field] || Buffer.byteLength(env[field]!) < 32) context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: "Alerts require separate keys of at least 32 UTF-8 bytes" });
    }
    if (env.ALERTS_ENCRYPTION_KEY && env.ALERTS_ENCRYPTION_KEY === env.ALERTS_INDEX_KEY) context.addIssue({ code: z.ZodIssueCode.custom, path: ["ALERTS_INDEX_KEY"], message: "Alert encryption and index keys must differ" });
    if (!env.REDIS_URL) context.addIssue({ code: z.ZodIssueCode.custom, path: ["ALERTS_ENABLED"], message: "Alerts require Redis" });
    if (env.ROBINHOOD_CHAIN_ID !== 4663) context.addIssue({ code: z.ZodIssueCode.custom, path: ["ALERTS_ENABLED"], message: "Alerts support chain 4663 only" });
  }
  if (env.TELEGRAM_BOT_ENABLED) {
    if (!env.TELEGRAM_BOT_TOKEN || !/^\d{5,20}:[A-Za-z0-9_-]{30,128}$/.test(env.TELEGRAM_BOT_TOKEN)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["TELEGRAM_BOT_TOKEN"], message: "Telegram requires a valid bot token" });
    if (!env.TELEGRAM_WEBHOOK_SECRET || !/^[A-Za-z0-9_-]{32,256}$/.test(env.TELEGRAM_WEBHOOK_SECRET)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["TELEGRAM_WEBHOOK_SECRET"], message: "Telegram requires a webhook secret of 32 to 256 permitted characters" });
  }
  if (env.RECEIPTS_ENABLED) {
    const key = env.RECEIPT_SIGNING_KEY;
    const order = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
    if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key) || BigInt(key) <= 0n || BigInt(key) >= order) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["RECEIPT_SIGNING_KEY"], message: "A valid receipt signing key is required when receipts are enabled" });
    }
    if (!env.BUILD_SHA && !env.RAILWAY_GIT_COMMIT_SHA) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["BUILD_SHA"], message: "Receipts record the build commit; set BUILD_SHA or deploy from Git" });
    }
  }
  const aliases = env.APP_ORIGIN_ALIASES;
  if (aliases.length > 4) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["APP_ORIGIN_ALIASES"], message: "APP_ORIGIN_ALIASES accepts at most four origins" });
  }
  if (aliases.some((origin) => !isCanonicalAppOrigin(origin, env.NODE_ENV === "production"))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["APP_ORIGIN_ALIASES"],
      message: env.NODE_ENV === "production"
        ? "APP_ORIGIN_ALIASES must contain canonical HTTPS origins separated by commas"
        : "APP_ORIGIN_ALIASES must contain canonical HTTP or HTTPS origins separated by commas"
    });
  }
  let appOrigin = env.APP_ORIGIN;
  try {
    appOrigin = new URL(appOrigin).origin;
  } catch {
    // Production APP_ORIGIN validation below reports invalid configuration.
  }
  if (new Set(aliases).size !== aliases.length || aliases.includes(appOrigin)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["APP_ORIGIN_ALIASES"], message: "APP_ORIGIN_ALIASES must be distinct from APP_ORIGIN and each other" });
  }
  if (env.AI_PROVIDER === "openai" && !env.OPENAI_API_KEY) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "OPENAI_API_KEY is required when AI_PROVIDER is openai" });
  }
  if (env.GOLDRUSH_ENABLED && !env.GOLDRUSH_API_KEY) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "GOLDRUSH_API_KEY is required when GoldRush is enabled" });
  }
  if (env.SWAP_QUOTE_SOURCE === "uniswap-api" && !env.UNISWAP_API_KEY) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "UNISWAP_API_KEY is required when SWAP_QUOTE_SOURCE is uniswap-api" });
  }
  if (env.PORTFOLIO_MODE_ENABLED && env.NODE_ENV !== "test") {
    const publicRpc = new URL(env.ROBINHOOD_PUBLIC_RPC_URL);
    const isOfficialRobinhoodRpc = publicRpc.protocol === "https:"
      && publicRpc.hostname === "rpc.mainnet.chain.robinhood.com"
      && publicRpc.port === ""
      && publicRpc.username === ""
      && publicRpc.password === ""
      && (publicRpc.pathname === "" || publicRpc.pathname === "/")
      && publicRpc.search === ""
      && publicRpc.hash === "";
    if (!isOfficialRobinhoodRpc) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ROBINHOOD_PUBLIC_RPC_URL"],
        message: "Enabled Portfolio Intelligence requires the official Robinhood Public RPC endpoint"
      });
    }
    const blockscoutBase = new URL(env.BLOCKSCOUT_PRO_API_KEY
      ? env.BLOCKSCOUT_PRO_API_BASE_URL
      : env.BLOCKSCOUT_API_BASE_URL);
    const usesOfficialBlockscout = blockscoutBase.protocol === "https:"
      && blockscoutBase.port === ""
      && blockscoutBase.username === ""
      && blockscoutBase.password === ""
      && blockscoutBase.search === ""
      && blockscoutBase.hash === ""
      && (env.BLOCKSCOUT_PRO_API_KEY
        ? blockscoutBase.hostname === "api.blockscout.com"
          && (blockscoutBase.pathname === "" || blockscoutBase.pathname === "/")
        : blockscoutBase.hostname === "robinhoodchain.blockscout.com"
          && ["/api/v2", "/api/v2/"].includes(blockscoutBase.pathname));
    if (!usesOfficialBlockscout) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [env.BLOCKSCOUT_PRO_API_KEY ? "BLOCKSCOUT_PRO_API_BASE_URL" : "BLOCKSCOUT_API_BASE_URL"],
        message: "Enabled Portfolio Intelligence requires the official Blockscout endpoint"
      });
    }
    if (env.ROBINHOOD_CHAIN_ID !== 4663 || env.BLOCKSCOUT_CHAIN_ID !== 4663) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enabled Portfolio Intelligence requires Robinhood Chain ID 4663"
      });
    }
  }
  if (env.RWA_VERIFY_ENABLED && env.NODE_ENV !== "test") {
    const publicRpc = new URL(env.ROBINHOOD_PUBLIC_RPC_URL);
    const isOfficialRobinhoodRpc = publicRpc.protocol === "https:"
      && publicRpc.origin === "https://rpc.mainnet.chain.robinhood.com"
      && (publicRpc.pathname === "" || publicRpc.pathname === "/")
      && publicRpc.search === ""
      && publicRpc.hash === ""
      && publicRpc.username === ""
      && publicRpc.password === "";
    if (!isOfficialRobinhoodRpc || env.ROBINHOOD_CHAIN_ID !== 4663) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ROBINHOOD_PUBLIC_RPC_URL"],
        message: "Enabled Stock-token check requires the official Robinhood Chain public RPC and chain ID 4663"
      });
    }
  }
  if (env.OBSERVED_TRADES_ENABLED && env.NODE_ENV !== "test") {
    const publicRpc = new URL(env.ROBINHOOD_PUBLIC_RPC_URL);
    const isOfficialRobinhoodRpc = publicRpc.protocol === "https:"
      && publicRpc.origin === "https://rpc.mainnet.chain.robinhood.com"
      && (publicRpc.pathname === "" || publicRpc.pathname === "/")
      && publicRpc.search === ""
      && publicRpc.hash === ""
      && publicRpc.username === ""
      && publicRpc.password === "";
    if (!isOfficialRobinhoodRpc || env.ROBINHOOD_CHAIN_ID !== 4663) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ROBINHOOD_PUBLIC_RPC_URL"],
        message: "Enabled Biggest Observed Trades require the official Robinhood Chain public RPC and chain ID 4663"
      });
    }
  }
  if (env.EXIT_CHECK_ENABLED && env.NODE_ENV !== "test") {
    const publicRpc = new URL(env.ROBINHOOD_PUBLIC_RPC_URL);
    const isOfficialRobinhoodRpc = publicRpc.protocol === "https:"
      && publicRpc.origin === "https://rpc.mainnet.chain.robinhood.com"
      && (publicRpc.pathname === "" || publicRpc.pathname === "/")
      && publicRpc.search === ""
      && publicRpc.hash === ""
      && publicRpc.username === ""
      && publicRpc.password === "";
    if (!isOfficialRobinhoodRpc || env.ROBINHOOD_CHAIN_ID !== 4663) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ROBINHOOD_PUBLIC_RPC_URL"],
        message: "Enabled Exit Check requires the official Robinhood Chain public RPC and chain ID 4663"
      });
    }
  }
  if (env.ROBINHOOD_RPC_PROVIDER === "drpc") {
    if (!env.DRPC_API_KEY || !DRPC_KEY_PATTERN.test(env.DRPC_API_KEY)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DRPC_API_KEY"],
        message: "The dRPC transport requires a DRPC_API_KEY of 16 to 256 URL-safe characters"
      });
    }
    if (env.ROBINHOOD_CHAIN_ID !== 4663) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ROBINHOOD_CHAIN_ID"],
        message: "The dRPC transport is admitted for Robinhood Chain ID 4663 only"
      });
    }
  }
  if (env.COLLECTIBLE_CATALOG_ENABLED && env.NODE_ENV !== "test") {
    const tcgdex = new URL(env.TCGDEX_API_BASE_URL);
    const isOfficialTcgdex = tcgdex.protocol === "https:"
      && tcgdex.hostname === "api.tcgdex.net"
      && tcgdex.port === ""
      && tcgdex.username === ""
      && tcgdex.password === ""
      && ["/v2", "/v2/"].includes(tcgdex.pathname)
      && tcgdex.search === ""
      && tcgdex.hash === "";
    if (!isOfficialTcgdex) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TCGDEX_API_BASE_URL"],
        message: "Enabled Collectible Catalog requires the official TCGdex v2 endpoint"
      });
    }
  }
  if (env.NODE_ENV !== "production") return;
  if (env.AUTH_EMAIL_ENABLED && (!env.SMTP_HOST || !env.EMAIL_FROM)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "SMTP_HOST and EMAIL_FROM are required in production when AUTH_EMAIL_ENABLED is true"
    });
  }
  if (env.JWT_ACCESS_SECRET === "dev_access_secret_change_me" || env.JWT_REFRESH_SECRET === "dev_refresh_secret_change_me") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Production JWT secrets must be configured" });
  }
  if (env.JWT_ACCESS_SECRET.length < 32 || env.JWT_REFRESH_SECRET.length < 32) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Production JWT secrets must each contain at least 32 characters" });
  }
  if (new Set([env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET, env.METRICS_TOKEN]).size !== 3) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "JWT access, JWT refresh, and metrics secrets must be distinct" });
  }
  if (!isCanonicalAppOrigin(env.APP_ORIGIN, true)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Production APP_ORIGIN must be an explicit canonical HTTPS origin" });
  }
  if (!env.REDIS_URL || (env.CLOUD_WORKSPACE_ENABLED && !env.DATABASE_URL)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "REDIS_URL is required in production; DATABASE_URL is also required when cloud research is enabled" });
  }
  if (env.DATABASE_URL && !env.RETENTION_ENABLED) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Retention cleanup cannot be disabled in production" });
  }
  if (!env.ENABLE_METRICS || !env.METRICS_TOKEN || env.METRICS_TOKEN.length < 32) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Protected metrics and a METRICS_TOKEN of at least 32 characters are required in production"
    });
  }
  if (env.ENABLE_PUBLIC_RPC_FALLBACK) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Public RPC fallback must be disabled in production" });
  }
  const chainReadsEnabled = env.PRIVATE_MODE_ENABLED
    || env.NETWORK_PULSE_ENABLED
    || env.PUBLIC_CARDS_ENABLED || env.PUBLIC_MCP_ENABLED || env.TELEGRAM_BOT_ENABLED
    || env.PORTFOLIO_MODE_ENABLED
    || env.STOCK_DESK_ENABLED
    || env.RWA_VERIFY_ENABLED
    || env.EXIT_CHECK_ENABLED
    || env.LINKED_WALLETS_ENABLED
    || env.CLAIM_CHECK_ENABLED
    || env.LAUNCH_CARDS_ENABLED
    || env.OBSERVED_TRADES_ENABLED;
  if (chainReadsEnabled && env.ROBINHOOD_RPC_PROVIDER !== "drpc") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ROBINHOOD_RPC_PROVIDER"],
      message: "Production Robinhood Chain reads must use the admitted dRPC transport; the public RPC is development-only"
    });
  }
  if (env.CSRF_PROTECTION_ENABLED === false) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "CSRF protection cannot be disabled in production" });
  }
}).transform(({ APP_ORIGIN_ALIASES, ...env }) => ({ ...env, APP_ORIGIN_ALIAS_LIST: APP_ORIGIN_ALIASES }));

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Existing isolated auth/research tests exercise the deferred cloud path.
  // An explicit false always wins, including in test mode.
  return envSchema.parse({ ...source, CLOUD_WORKSPACE_ENABLED: source.CLOUD_WORKSPACE_ENABLED ?? (source.NODE_ENV === "test" ? "true" : "false") });
}
