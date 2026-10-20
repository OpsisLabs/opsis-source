import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { isIP } from "node:net";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Env } from "../config/env.js";
import { rateLimitClientAddress } from "../http/authenticate.js";
import { AppError } from "../http/errors.js";
import type { OpenDataLimiter } from "./limiter.js";

/** Only reach surfaces use this /64 key; existing client-address behavior stays intact. */
export function cardClientAddress(address: string): string {
  if (isIP(address) !== 6) return address;
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  if (canonical.startsWith("::ffff:")) {
    const pair = canonical
      .slice(7)
      .split(":")
      .map((word) => parseInt(word, 16));
    return pair.flatMap((word) => [word >> 8, word & 255]).join(".");
  }
  const [left, right] = canonical.split("::");
  const prefix = left ? left.split(":") : [];
  const suffix = right ? right.split(":") : [];
  const words = canonical.includes("::")
    ? [
        ...prefix,
        ...Array<string>(8 - prefix.length - suffix.length).fill("0"),
        ...suffix,
      ]
    : prefix;
  return `${words
    .slice(0, 4)
    .map((word) => parseInt(word, 16).toString(16))
    .join(":")}::/64`;
}
export class CardProofOfWork {
  constructor(
    private readonly secret: string,
    private readonly now: () => number = Date.now,
  ) {}
  issue() {
    const challenge = {
      nonce: randomBytes(24).toString("hex"),
      difficulty: 18,
      expiresAt: this.now() + 120_000,
    };
    const encoded = Buffer.from(JSON.stringify(challenge)).toString(
      "base64url",
    );
    return { ...challenge, token: `${encoded}.${this.mac(encoded)}` };
  }
  verify(token: unknown, solution: unknown): boolean {
    if (
      typeof token !== "string" ||
      token.length > 512 ||
      typeof solution !== "string" ||
      !/^\d{1,16}$/.test(solution)
    )
      return false;
    const [body, signature, extra] = token.split(".");
    if (
      !body ||
      !signature ||
      extra ||
      !/^[a-f0-9]{64}$/.test(signature) ||
      !timingSafeEqual(
        Buffer.from(this.mac(body), "hex"),
        Buffer.from(signature, "hex"),
      )
    )
      return false;
    try {
      const challenge = JSON.parse(
        Buffer.from(body, "base64url").toString("utf8"),
      ) as { nonce: unknown; difficulty: unknown; expiresAt: unknown };
      if (
        typeof challenge.nonce !== "string" ||
        !/^[a-f0-9]{48}$/.test(challenge.nonce) ||
        challenge.difficulty !== 18 ||
        typeof challenge.expiresAt !== "number" ||
        challenge.expiresAt <= this.now() ||
        challenge.expiresAt > this.now() + 120_000
      )
        return false;
      const digest = createHash("sha256")
        .update(`${token}:${solution}`)
        .digest();
      return digest[0] === 0 && digest[1] === 0 && (digest[2]! & 0xc0) === 0;
    } catch {
      return false;
    }
  }
  private mac(body: string) {
    return createHmac("sha256", this.secret)
      .update(`OPSIS-CARD-POW-1:${body}`)
      .digest("hex");
  }
}
export const reachRouteConfig = {
  cors: false,
  rateLimit: false as const,
  credentiallessPublic: true,
};
export function reachGuard(
  env: Env,
  limiter: OpenDataLimiter,
  enabled: () => boolean,
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header("cache-control", "private, no-store");
    if (!env.OPEN_DATA_API_ENABLED || !enabled())
      throw new AppError("NOT_FOUND", 404, "Not found");
    try {
      const cap = await limiter.consume(
        cardClientAddress(rateLimitClientAddress(request)),
      );
      reply
        .header("ratelimit-limit", cap.limit)
        .header("ratelimit-remaining", cap.remaining)
        .header("ratelimit-reset", cap.resetSeconds);
    } catch (error) {
      if (error instanceof AppError) {
        const seconds = (
          error.details as { retryAfterSeconds?: number } | undefined
        )?.retryAfterSeconds;
        if (seconds) reply.header("retry-after", seconds);
      }
      throw error;
    }
    if (request.headers.cookie || request.headers.authorization)
      throw new AppError(
        "PUBLIC_CREDENTIALS_REJECTED",
        400,
        "Account credentials are not accepted",
      );
  };
}
