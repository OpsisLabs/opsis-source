import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
import {
  ADVICE,
  cardCacheRemaining,
  type TokenCardSource,
} from "../cards/service.js";
import { renderCardSvg } from "../cards/render.js";
import {
  CardProofOfWork,
  reachGuard,
  reachRouteConfig,
} from "../open-data/card-guard.js";
import type { OpenDataLimiter } from "../open-data/limiter.js";

export async function publicCardRoutes(
  app: FastifyInstance,
  env: Env,
  limiter: OpenDataLimiter,
  cards: TokenCardSource,
) {
  const guard = reachGuard(env, limiter, () => env.PUBLIC_CARDS_ENABLED);
  const proof = new CardProofOfWork(env.PUBLIC_CARDS_HMAC_SECRET ?? "");
  const prefix = "/v1/public/open-data/v1/cards";
  app.get(
    `${prefix}/challenge`,
    { config: reachRouteConfig, onRequest: guard },
    async () => ({ ...proof.issue(), disclaimer: ADVICE }),
  );
  for (const svg of [false, true]) {
    app.get<{
      Params: { address: string };
    }>(
      `${prefix}/token/:address${svg ? ".svg" : ""}`,
      { config: reachRouteConfig, onRequest: guard },
      async (request, reply) => {
        if (
          !svg &&
          !proof.verify(
            request.headers["x-opsis-pow-challenge"],
            request.headers["x-opsis-pow-solution"],
          )
        )
          return reply.code(428).send({
            error: {
              code: "PROOF_REQUIRED",
              message: "Obtain a challenge and provide a solution",
            },
            challenge: proof.issue(),
            disclaimer: ADVICE,
          });
        const card = await cards.card(request.params.address);
        if (!svg) return card;
        return reply
          .header(
            "cache-control",
            `public, max-age=${cardCacheRemaining(card, env.PUBLIC_CARDS_CACHE_SECONDS)}`,
          )
          .header("content-security-policy", "default-src 'none'; sandbox")
          .header("x-content-type-options", "nosniff")
          .type("image/svg+xml; charset=utf-8")
          .send(renderCardSvg(card));
      },
    );
  }
}

/** Apply to an encapsulated reach plugin so errors and parser failures retain disclosures. */
export function reachResponseHeaders(app: FastifyInstance) {
  app.addHook("onSend", async (_request, reply, payload) => {
    if (
      !String(reply.getHeader("content-type") ?? "").startsWith(
        "image/svg+xml",
      ) ||
      !reply.hasHeader("cache-control")
    )
      reply.header("cache-control", "private, no-store");
    reply.header("x-opsis-disclaimer", ADVICE);
    if (
      typeof payload === "string" &&
      String(reply.getHeader("content-type") ?? "").includes("application/json")
    ) {
      const body: unknown = JSON.parse(payload);
      if (body && typeof body === "object" && !Array.isArray(body))
        return JSON.stringify({ ...body, disclaimer: ADVICE });
    }
    return payload;
  });
}
