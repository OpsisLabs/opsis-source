import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "../http/errors.js";
import type { Env } from "../config/env.js";
export function authorizeDealPreview(env: Env, authorization: string | undefined, now = Date.now()): void {
  const match = /^Preview ([a-f0-9]{64})$/.exec(authorization ?? "");
  const expected = env.DEAL_FINDER_PREVIEW_HASH;
  const expiry = env.DEAL_FINDER_PREVIEW_EXPIRES_AT;
  if (!env.COLLECTIBLE_DEAL_FINDER_ENABLED || !match || !expected || !/^[a-f0-9]{64}$/.test(expected) ||
      !expiry || !Number.isFinite(Date.parse(expiry)) || now >= Date.parse(expiry)) {
    throw new AppError("NOT_FOUND", 404, "Preview unavailable");
  }
  if (!timingSafeEqual(createHash("sha256").update(match[1]!).digest(), Buffer.from(expected, "hex"))) {
    throw new AppError("NOT_FOUND", 404, "Preview unavailable");
  }
}
