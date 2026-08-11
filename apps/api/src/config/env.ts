import { z } from "zod";

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
  DATABASE_URL: z.string().optional(),
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
  ENABLE_PUBLIC_RPC_FALLBACK: envBoolean.default(false),
  BLOCKSCOUT_API_BASE_URL: z.string().url().default("https://robinhoodchain.blockscout.com/api/v2"),
  BLOCKSCOUT_API_KEY: optionalString,
  BLOCKSCOUT_PRO_API_BASE_URL: z.string().url().default("https://api.blockscout.com"),
  BLOCKSCOUT_PRO_API_KEY: optionalString,
  BLOCKSCOUT_CHAIN_ID: z.coerce.number().int().default(4663),
  BLOCKSCOUT_MAX_PAGES: z.coerce.number().int().min(1).max(10).default(3),
  ALCHEMY_API_KEY: z.string().optional(),
  ALCHEMY_ROBINHOOD_RPC_URL: optionalUrl,
  ALCHEMY_ROBINHOOD_WS_URL: optionalUrl,
  UNISWAP_QUOTE_ENABLED: envBoolean.default(false),
  UNISWAP_API_KEY: optionalString,
  UNISWAP_API_BASE_URL: z.string().url().default("https://trade-api.gateway.uniswap.org/v1"),
  UNISWAP_QUOTE_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(8_000),
  UNISWAP_QUOTE_CACHE_SECONDS: z.coerce.number().int().min(5).max(29).default(15),
  UNISWAP_QUOTE_BUDGET_PER_MINUTE: z.coerce.number().int().min(1).max(120).default(30),
  UNISWAP_QUOTE_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(120).default(20),
  PRIVATE_MODE_ENABLED: envBoolean.default(true),
  PORTFOLIO_MODE_ENABLED: envBoolean.default(false),
  PORTFOLIO_DAILY_RPC_UNIT_BUDGET: z.coerce.number().int().min(100).max(100_000).default(5_000),
  PORTFOLIO_MAX_RPC_SUBCALLS: z.coerce.number().int().min(10).max(100).default(64),
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
  RATE_LIMIT_AUTH_PER_HOUR: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_CHAT_PER_HOUR: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_LOOKUP_PER_HOUR: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WALLET_PER_HOUR: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_PUBLIC_PER_HOUR: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_PORTFOLIO_PER_HOUR: z.coerce.number().int().min(1).max(60).default(10),
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
  RETENTION_INTERVAL_HOURS: z.coerce.number().positive().default(24),
  RETENTION_AUTH_DAYS: z.coerce.number().int().positive().default(30),
  RETENTION_SOURCE_DAYS: z.coerce.number().int().positive().default(30),
  RETENTION_AUDIT_DAYS: z.coerce.number().int().positive().default(90),
  RETENTION_USAGE_DAYS: z.coerce.number().int().positive().default(90),
  RETENTION_CHAT_DAYS: z.coerce.number().int().positive().default(365),
  LOG_LEVEL: z.string().default("info"),
  ENABLE_METRICS: envBoolean.default(true),
  // Swagger UI is useful in development but advertises the whole surface,
  // including admin routes. Defaults off in production; set true to publish it.
  ENABLE_API_DOCS: z.preprocess((v) => (v === "" ? undefined : v), envBoolean.optional()),
  // When set, /metrics requires this bearer token and 404s otherwise.
  METRICS_TOKEN: optionalString
}).superRefine((env, context) => {
  if (env.AI_PROVIDER === "openai" && !env.OPENAI_API_KEY) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "OPENAI_API_KEY is required when AI_PROVIDER is openai" });
  }
  if (env.GOLDRUSH_ENABLED && !env.GOLDRUSH_API_KEY) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "GOLDRUSH_API_KEY is required when GoldRush is enabled" });
  }
  if (env.UNISWAP_QUOTE_ENABLED && !env.UNISWAP_API_KEY) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "UNISWAP_API_KEY is required when Scout Swap quotes are enabled" });
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
  if (!env.DATABASE_URL || !env.REDIS_URL) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "DATABASE_URL and REDIS_URL are required in production" });
  }
  if (env.ENABLE_PUBLIC_RPC_FALLBACK) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Public RPC fallback must be disabled in production" });
  }
  if (env.CSRF_PROTECTION_ENABLED === false) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "CSRF protection cannot be disabled in production" });
  }
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
