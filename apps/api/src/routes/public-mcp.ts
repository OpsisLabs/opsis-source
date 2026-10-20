import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { keccak256, recoverAddress } from "viem";
import { verifyReceipt } from "@rh-chain/shared";
import type { Env } from "../config/env.js";
import { ADVICE, type TokenCardSource } from "../cards/service.js";
import type { ReceiptService } from "../receipts/service.js";
import { listOpenDataAssets } from "../open-data/registry.js";
import {
  CardProofOfWork,
  reachGuard,
  reachRouteConfig,
} from "../open-data/card-guard.js";
import type { OpenDataLimiter } from "../open-data/limiter.js";
import { AppError } from "../http/errors.js";
const address = z
  .object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) })
  .strict();
const receiptInput = z
  .object({ receipt: z.string().min(1).max(200_000) })
  .strict();
const empty = z.object({}).strict();
export const MCP_TOOLS = [
  {
    name: "token_card",
    description:
      "Read a partial token card with proof of work in request headers. Carries its observation receipt when enabled. Not investment advice",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
      },
      required: ["address"],
      additionalProperties: false,
    },
  },
  {
    name: "verify_receipt",
    description:
      "Check canonical receipt integrity against published keys. Returns no receipt. Not investment advice",
    inputSchema: {
      type: "object",
      properties: {
        receipt: { type: "string", minLength: 1, maxLength: 200000 },
      },
      required: ["receipt"],
      additionalProperties: false,
    },
  },
  {
    name: "open_data_assets",
    description:
      "Read the reviewed static support registry. Returns no receipt. Not investment advice",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];
const rpc = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: z
      .union([z.string().max(128), z.number().int().safe(), z.null()])
      .optional(),
    method: z.string().max(128),
    params: z.record(z.unknown()).optional(),
  })
  .strict();
const init = z
  .object({
    protocolVersion: z.string(),
    capabilities: z.record(z.unknown()),
    clientInfo: z
      .object({ name: z.string().max(128), version: z.string().max(128) })
      .passthrough(),
  })
  .passthrough();
const versions = ["2025-03-26", "2025-06-18", "2025-11-25"];
export async function publicMcpRoutes(
  app: FastifyInstance,
  env: Env,
  limiter: OpenDataLimiter,
  cards: TokenCardSource,
  receipts?: ReceiptService,
) {
  const proof = new CardProofOfWork(env.PUBLIC_CARDS_HMAC_SECRET ?? "");
  const guard = reachGuard(env, limiter, () => env.PUBLIC_MCP_ENABLED);
  const allowed = new Set([
    new URL(env.APP_ORIGIN).origin,
    ...env.APP_ORIGIN_ALIAS_LIST,
  ]);
  const endpoint = "/v1/public/open-data/v1/mcp";
  app.get(
    `${endpoint}/keys`,
    { config: reachRouteConfig, onRequest: guard },
    async () => ({ keys: receipts?.keys ?? [], disclaimer: ADVICE }),
  );
  app.route({
    method: ["GET", "DELETE"],
    url: endpoint,
    config: reachRouteConfig,
    onRequest: async (request, reply) => {
      await guard(request, reply);
      if (
        request.headers.origin !== undefined &&
        !allowed.has(request.headers.origin)
      )
        throw new AppError(
          "MCP_ORIGIN_REJECTED",
          403,
          "Origin was not accepted",
        );
    },
    handler: async (_request, reply) =>
      reply
        .header("allow", "POST")
        .code(405)
        .send({ error: "METHOD_NOT_ALLOWED", disclaimer: ADVICE }),
  });
  app.post(
    endpoint,
    {
      config: reachRouteConfig,
      bodyLimit: 256_000,
      errorHandler: (error, _request, reply) => {
        if (
          error.code === "FST_ERR_CTP_INVALID_JSON_BODY" ||
          error.code === "FST_ERR_CTP_EMPTY_JSON_BODY"
        )
          return reply.code(400).send({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error" },
            disclaimer: ADVICE,
          });
        return reply
          .code(error instanceof AppError ? error.statusCode : 400)
          .send({
            error: {
              code:
                error instanceof AppError ? error.code : "MCP_REQUEST_REJECTED",
              message: "Request rejected",
            },
            disclaimer: ADVICE,
          });
      },
      onRequest: async (request, reply) => {
        await guard(request, reply);
        if (
          request.headers.origin !== undefined &&
          !allowed.has(request.headers.origin)
        )
          throw new AppError(
            "MCP_ORIGIN_REJECTED",
            403,
            "Origin was not accepted",
          );
        if (
          (request.headers["content-type"] ?? "")
            .split(";")[0]
            ?.trim()
            .toLowerCase() !== "application/json"
        )
          throw new AppError("JSON_REQUIRED", 415, "JSON required");
        const protocol = request.headers["mcp-protocol-version"];
        if (
          protocol !== undefined &&
          (typeof protocol !== "string" || !versions.includes(protocol))
        )
          throw new AppError(
            "MCP_VERSION_UNSUPPORTED",
            400,
            "Protocol version unsupported",
          );
      },
    },
    async (request, reply) => {
      const parsed = rpc.safeParse(request.body);
      const error = (
        id: string | number | null,
        code: number,
        message: string,
      ) => ({
        jsonrpc: "2.0",
        id,
        error: { code, message },
        disclaimer: ADVICE,
      });
      if (!parsed.success)
        return reply.code(400).send(error(null, -32600, "Invalid Request"));
      const { id, method, params } = parsed.data;
      if (id === undefined) return reply.code(202).send();
      const result = (value: unknown) => ({
        jsonrpc: "2.0",
        id,
        result: value,
        disclaimer: ADVICE,
      });
      if (method === "initialize") {
        const input = init.safeParse(params);
        if (!input.success) return error(id, -32602, "Invalid params");
        return result({
          protocolVersion: versions.includes(input.data.protocolVersion)
            ? input.data.protocolVersion
            : "2025-11-25",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "opsis-read-only", version: "1.0.0" },
          instructions: ADVICE,
        });
      }
      if (method === "tools/list") {
        if (!empty.safeParse(params ?? {}).success)
          return error(id, -32602, "Invalid params");
        return result({ tools: MCP_TOOLS });
      }
      if (method !== "tools/call") return error(id, -32601, "Method not found");
      const call = z
        .object({ name: z.string(), arguments: z.unknown().optional() })
        .strict()
        .safeParse(params);
      if (!call.success) return error(id, -32602, "Invalid params");
      const { name, arguments: args = {} } = call.data;
      if (!MCP_TOOLS.some((tool) => tool.name === name))
        return error(id, -32602, "Unknown tool");
      let output: Record<string, unknown>;
      try {
        if (name === "token_card") {
          const input = address.parse(args);
          if (
            !proof.verify(
              request.headers["x-opsis-pow-challenge"],
              request.headers["x-opsis-pow-solution"],
            )
          )
            return reply
              .code(428)
              .send({
                ...error(id, -32602, "Proof of work required"),
                challenge: proof.issue(),
              });
          output = await cards.card(input.address);
        } else {
          if (name === "verify_receipt") {
            const input = receiptInput.parse(args);
            const checks = await verifyReceipt(
              input.receipt,
              receipts?.keys ?? [],
              { keccak256, recoverAddress },
            );
            // Never reflect untrusted receipt inputs or outputs, including executable data.
            delete checks.receipt;
            output = { checks, disclaimer: ADVICE };
          } else {
            empty.parse(args);
            output = {
              ...listOpenDataAssets(
                env.BUILD_SHA ?? env.RAILWAY_GIT_COMMIT_SHA ?? null,
              ),
              disclaimer: ADVICE,
            };
          }
        }
        if (name === "token_card" && env.RECEIPTS_ENABLED && !output.receipt)
          throw new AppError(
            "RECEIPTS_UNAVAILABLE",
            503,
            "Receipt unavailable",
          );
        return result({
          content: [{ type: "text", text: JSON.stringify(output) }],
          isError: false,
        });
      } catch (caught) {
        if (caught instanceof z.ZodError)
          return error(id, -32602, "Invalid tool arguments");
        if (env.RECEIPTS_ENABLED)
          return error(id, -32603, "Tool or receipt unavailable");
        return result({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "TOOL_UNAVAILABLE",
                disclaimer: ADVICE,
              }),
            },
          ],
          isError: true,
        });
      }
    },
  );
}
