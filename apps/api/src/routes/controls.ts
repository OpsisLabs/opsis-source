import type { ReceiptService } from "../receipts/service.js";
import type { ControlsEvidence } from "../controls/service.js";
import type { Json } from "@rh-chain/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config/env.js";
import type { ControlsSource } from "../controls/service.js";
import { AppError } from "../http/errors.js";
const body = z
  .object({ contract: z.string().regex(/^0x[0-9a-fA-F]{40}$/) })
  .strict();
export async function controlsRoutes(
  app: FastifyInstance,
  env: Env,
  service: ControlsSource,
  receipts?: ReceiptService,
) {
  app.post(
    "/v1/private/opsis/controls",
    { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } },
    async (request, reply) => {
      reply.header("cache-control", "private, no-store");
      if (
        !env.OPSIS_WORKSPACES_ENABLED ||
        !env.TOKEN_CONTROLS_ENABLED ||
        !env.PRIVATE_MODE_ENABLED
      )
        throw new AppError("NOT_FOUND", 404, "Not found");
      const input = body.parse(request.body);
      if (!env.RECEIPTS_ENABLED || (request.query as Record<string, unknown>).receipt !== "1") return service.check(input.contract);
      if (!receipts) throw new AppError("RECEIPTS_UNAVAILABLE", 503, "Receipt unavailable");
      const evidence: ControlsEvidence = { rpcCalls: [], sources: [] };
      const outputs = await service.check(input.contract, evidence);
      if (!evidence.rpcCalls.length || evidence.rpcCalls.length !== outputs.coverage.rpcCalls) throw new AppError("RECEIPTS_UNAVAILABLE", 503, "Receipt evidence unavailable");
      try {
        const receipt = await receipts.issue({ tool: "tokenControls", inputs: input, chainId: outputs.chainId,
          block: { number: String(outputs.anchor.blockNumber), hash: outputs.anchor.blockHash as `0x${string}`, timestamp: outputs.anchor.timestamp },
          ...evidence, outputs: outputs as unknown as Json, labelsetVersion: outputs.methodVersion });
        return { ...outputs, receipt };
      } catch { throw new AppError("RECEIPTS_UNAVAILABLE", 503, "Receipt unavailable"); }
    },
  );
}
