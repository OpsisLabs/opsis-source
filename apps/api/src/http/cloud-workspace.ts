import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";

/** Keep existing sessions readable/exportable, but never accept new research
 * into volatile storage outside the isolated test harness. */
export function installCloudWorkspaceGuard(app: FastifyInstance, env: Env, persistent: boolean) {
  const available = persistent || env.NODE_ENV === "test";
  app.addHook("onRequest", async (request, reply) => {
    if (available || request.method !== "POST") return;
    const path = request.url.split("?")[0] ?? "";
    const authWrite = path.startsWith("/v1/auth/") && ![
      "/v1/auth/refresh", "/v1/auth/logout",
    ].includes(path);
    if (!authWrite && !path.startsWith("/v1/chat/")) return;
    return reply.header("Cache-Control", "no-store").status(503).send({
      error: {
        code: "CLOUD_WORKSPACE_UNAVAILABLE",
        message: "Saved cloud research is temporarily unavailable. Use Private Explorer or the encrypted local Vault; neither needs cloud sign-in.",
      },
    });
  });
}
