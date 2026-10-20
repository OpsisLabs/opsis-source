import { ALERTS_PRIVACY } from "@rh-chain/shared";
import type { AlertCommands } from "../alerts/telegram.js";
import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
import type { TokenCardSource } from "../cards/service.js";
import { ADVICE } from "../cards/service.js";
import { cardSummary, cardTelegramHtml, escapeText, renderCardPng } from "../cards/render.js";
import { reachRouteConfig } from "../open-data/card-guard.js";
import { AppError } from "../http/errors.js";
export interface BotApiClient {
  sendMessage(input: {
    chat_id: number;
    text: string;
    parse_mode: "HTML";
    link_preview_options: { is_disabled: true };
  }): Promise<void>;
  /** Optional: the card as an image, as shown in the product video. */
  sendPhoto?(input: {
    chat_id: number;
    photo: Uint8Array;
    caption: string;
    parse_mode: "HTML";
  }): Promise<void>;
}
/** Token-bearing URLs and upstream errors never cross this transport boundary. */
export async function telegramFetchPost(
  url: string,
  body: unknown,
): Promise<void> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("TELEGRAM_SEND_UNAVAILABLE");
  } catch {
    throw new Error("TELEGRAM_SEND_UNAVAILABLE");
  }
}
export class TelegramBotApi implements BotApiClient {
  constructor(
    private readonly token: string,
    private readonly post: (
      url: string,
      body: unknown,
    ) => Promise<void> = telegramFetchPost,
  ) {}
  async sendMessage(input: Parameters<BotApiClient["sendMessage"]>[0]) {
    try {
      await this.post(
        `https://api.telegram.org/bot${this.token}/sendMessage`,
        input,
      );
    } catch {
      throw new Error("TELEGRAM_SEND_UNAVAILABLE");
    }
  }
  async sendPhoto(input: Parameters<NonNullable<BotApiClient["sendPhoto"]>>[0]) {
    try {
      const form = new FormData();
      form.set("chat_id", String(input.chat_id));
      form.set("caption", input.caption);
      form.set("parse_mode", input.parse_mode);
      form.set("photo", new Blob([Uint8Array.from(input.photo)], { type: "image/png" }), "opsis-card.png");
      const response = await fetch(
        `https://api.telegram.org/bot${this.token}/sendPhoto`,
        { method: "POST", body: form, signal: AbortSignal.timeout(15_000), redirect: "error" },
      );
      if (!response.ok) throw new Error("TELEGRAM_SEND_UNAVAILABLE");
    } catch {
      throw new Error("TELEGRAM_SEND_UNAVAILABLE");
    }
  }
}
type Bucket = { tokens: number; at: number };
function refill(
  bucket: Bucket,
  now: number,
  capacity: number,
  interval: number,
) {
  return Math.min(
    capacity,
    bucket.tokens + Math.max(0, now - bucket.at) / interval,
  );
}
export class TelegramBuckets {
  private readonly chats = new Map<
    string,
    { chat: Bucket; group: Bucket; touched: number }
  >();
  private global: Bucket;
  constructor(
    private readonly secret: string,
    private readonly now: () => number = Date.now,
  ) {
    this.global = { tokens: 30, at: now() };
  }
  take(chat: number, group: boolean): boolean {
    const now = this.now();
    for (const [key, entry] of this.chats)
      if (now - entry.touched >= 60_000) this.chats.delete(key);
    const key = createHmac("sha256", this.secret)
      .update(String(chat))
      .digest("hex");
    if (!this.chats.has(key) && this.chats.size >= 10_000) return false;
    const entry = this.chats.get(key) ?? {
      chat: { tokens: 1, at: now },
      group: { tokens: 1, at: now },
      touched: now,
    };
    const globalTokens = refill(this.global, now, 30, 1000 / 30);
    const chatTokens = refill(entry.chat, now, 1, 1000);
    const groupTokens = refill(entry.group, now, 1, 3000);
    if (globalTokens < 1 || chatTokens < 1 || (group && groupTokens < 1))
      return false;
    this.global = { tokens: globalTokens - 1, at: now };
    this.chats.set(key, {
      chat: { tokens: chatTokens - 1, at: now },
      group: { tokens: group ? groupTokens - 1 : groupTokens, at: now },
      touched: now,
    });
    return true;
  }
}
const update = z
  .object({
    message: z
      .object({
        text: z.string().max(512),
        chat: z
          .object({
            id: z.number().int().safe(),
            type: z.enum(["private", "group", "supergroup"]),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();
export function telegramSecretMatches(
  expected: string,
  actual: unknown,
): boolean {
  if (typeof actual !== "string" || actual.length > 256) return false;
  return timingSafeEqual(
    createHash("sha256").update(expected).digest(),
    createHash("sha256").update(actual).digest(),
  );
}
export async function telegramRoutes(
  app: FastifyInstance,
  env: Env,
  cards: TokenCardSource,
  bot?: BotApiClient,
  alerts?: AlertCommands,
  sharedDispatch?: TelegramBuckets,
) {
  if (!env.TELEGRAM_BOT_ENABLED) return;
  const client =
    bot ??
    (env.TELEGRAM_BOT_ENABLED
      ? new TelegramBotApi(env.TELEGRAM_BOT_TOKEN!)
      : undefined);
  const buckets = new TelegramBuckets(env.TELEGRAM_WEBHOOK_SECRET ?? "");
  app.post(
    "/v1/telegram/webhook",
    {
      config: reachRouteConfig,
      bodyLimit: 16_384,
      onRequest: async (request, reply) => {
        reply.header("cache-control", "private, no-store");
        if (!env.TELEGRAM_BOT_ENABLED)
          throw new AppError("NOT_FOUND", 404, "Not found");
        if (
          !telegramSecretMatches(
            env.TELEGRAM_WEBHOOK_SECRET!,
            request.headers["x-telegram-bot-api-secret-token"],
          )
        )
          throw new AppError("NOT_FOUND", 404, "Not found");
      },
    },
    async (request, reply) => {
      const parsed = update.safeParse(request.body);
      // Channel, callback, edited and malformed updates never trigger replies.
      if (
        !parsed.success ||
        Object.keys(request.body as object).some(
          (key) => key !== "update_id" && key !== "message",
        )
      )
        return { ok: true };
      const message = parsed.data.message;
      const match =
        /^\/opsis(?:@[A-Za-z][A-Za-z0-9_]{4,31})? (0x[0-9a-fA-F]{40})$/.exec(
          message.text,
        );
      const privacyCommand = /^\/privacy(?:@[A-Za-z][A-Za-z0-9_]{4,31})?(?:\s+(?:en|zh))?$/.test(message.text);
      const alertCommand = env.ALERTS_ENABLED && alerts?.accepts(message.text);
      if (
        (!match && !alertCommand && !privacyCommand) ||
        !buckets.take(message.chat.id, message.chat.type !== "private")
      )
        return { ok: true };
      if (!client)
        return reply.code(503).send({ error: "TELEGRAM_CLIENT_UNAVAILABLE" });
      try {
        if (privacyCommand) {
          if (!dispatch.take(message.chat.id, message.chat.type !== "private")) return { ok: true };
          const language = message.text.endsWith(" zh") ? "zh-CN" : message.text.endsWith(" en") ? "en" : undefined;
          const response = language ? ALERTS_PRIVACY[language].join("\n\n") : [...ALERTS_PRIVACY.en, ...ALERTS_PRIVACY["zh-CN"]].join("\n\n");
          await client.sendMessage({ chat_id: message.chat.id, text: escapeText(response), parse_mode: "HTML", link_preview_options: { is_disabled: true } });
          return { ok: true };
        }
        if (alertCommand && alerts) {
          // Reserve before mutations so a throttled response cannot hide a create/delete.
          if (!dispatch.take(message.chat.id, message.chat.type !== "private")) return { ok: true };
          const response = await alerts.execute(message.text, message.chat.id, message.chat.type !== "private");
          await client.sendMessage({ chat_id: message.chat.id, text: `<code>${escapeText(response)}</code>`, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
          return { ok: true };
        }
        const card = await cards.card(match![1]!);
        // Reserve once more at dispatch: variable card latency cannot create a burst.
        // Separate dispatch buckets avoid charging the same bucket twice.
        if (!dispatch.take(message.chat.id, message.chat.type !== "private"))
          return { ok: true };
        const research = `${new URL(env.APP_ORIGIN).origin}/research?entity=${encodeURIComponent(card.address)}`;
        if (client.sendPhoto) {
          try {
            const summary = cardSummary(card);
            await client.sendPhoto({
              chat_id: message.chat.id,
              photo: renderCardPng(card),
              caption: [
                `<b>${escapeText(summary.symbol)}</b>${summary.name ? ` · ${escapeText(summary.name)}` : ""}`,
                `<i>${escapeText(ADVICE)}</i>`,
                `<a href="${escapeText(research)}">Research in Opsis ↗</a>`,
              ].join("\n"),
              parse_mode: "HTML",
            });
            return { ok: true };
          } catch {
            // Fall through to the text card; the reader still gets the same rows.
          }
        }
        const text = cardTelegramHtml(card, research);
        if (text.length > 4096) return { ok: true };
        await client.sendMessage({
          chat_id: message.chat.id,
          text,
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        });
        return { ok: true };
      } catch {
        return reply
          .code(503)
          .send({ error: "TELEGRAM_REPLY_UNAVAILABLE", disclaimer: ADVICE });
      }
    },
  );
  const dispatch = sharedDispatch ?? new TelegramBuckets(env.TELEGRAM_WEBHOOK_SECRET ?? "");
}
