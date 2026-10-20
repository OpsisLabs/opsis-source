import { claimTypes, launchpads } from "@rh-chain/shared";
import { z } from "zod";

const addressPattern = "^0x[0-9a-fA-F]{40}$";
const stockPattern = "^(?:0x[0-9a-fA-F]{40}|[A-Za-z][A-Za-z0-9.]{0,15})$";
export const stockDeskInput = z
  .object({ token: z.string().regex(new RegExp(stockPattern)) })
  .strict();
const percent = {
  type: "string",
  pattern: "^(?:0?\\d{1,2}(?:\\.\\d{1,6})?|100(?:\\.0{1,6})?)$",
  description:
    "Percentage from 0 to 100, up to six decimal places. / 0 到 100 的百分比，最多六位小数。",
};
const claimInputSchema = {
  type: "object",
  properties: {
    confirmed: {
      const: true,
      description:
        "Explicit confirmation of the exact token contract. / 明确确认代币的完整合约地址。",
    },
    address: {
      type: "string",
      pattern: "^0[xX][0-9a-fA-F]{40}$",
      not: { pattern: "^0[xX]0{40}$" },
    },
    claims: {
      type: "array",
      minItems: 1,
      maxItems: 32,
      items: {
        anyOf: [
          {
            type: "object",
            properties: {
              type: { enum: ["ownership", "paused", "lpBurned", "verified"] },
              expected: { type: "boolean" },
            },
            required: ["type", "expected"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              type: { enum: ["top10", "deployer"] },
              comparison: { enum: ["under", "over", "equal"] },
              percent,
            },
            required: ["type", "comparison", "percent"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              type: { const: "launchpad" },
              launchpad: { enum: launchpads },
            },
            required: ["type", "launchpad"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              type: { const: "tax" },
              buy: { anyOf: [percent, { type: "null" }] },
              sell: { anyOf: [percent, { type: "null" }] },
            },
            required: ["type", "buy", "sell"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: { type: { const: "unsupported" } },
            required: ["type"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              type: {
                type: "string",
                maxLength: 64,
                pattern: "^[a-zA-Z][a-zA-Z0-9_]*$",
                not: { enum: claimTypes },
              },
            },
            required: ["type"],
            additionalProperties: false,
          },
        ],
      },
    },
    postTime: {
      type: "string",
      format: "date-time",
      description:
        "Optional ISO 8601 post time with a timezone offset. / 可选的带时区偏移的 ISO 8601 发布时间。",
    },
  },
  required: ["confirmed", "address", "claims"],
  additionalProperties: false,
};

export const MCP_RESEARCH_TOOLS = [
  {
    name: "stock_desk",
    description:
      "Read-only Stock Token Desk for a reviewed Robinhood Chain (4663) ticker or contract address in token (case-insensitive). Returns reference, gap, feed status, depth, disclaimer and any receipt. Requires token_card proof-of-work headers. Not investment advice. / 只读股票代币工作台：token 接受经审查的 Robinhood Chain（4663）代码或合约地址（不区分大小写）。返回参考价、价差、预言机状态、深度、免责声明及已有回执。需要与 token_card 相同的工作量证明请求头。不构成投资建议。",
    inputSchema: {
      type: "object",
      properties: {
        token: {
          type: "string",
          pattern: stockPattern,
          description:
            "Reviewed Stock Token ticker (for example AAPL) or full contract address. / 经审查的股票代币代码（如 AAPL）或完整合约地址。",
        },
      },
      required: ["token"],
      additionalProperties: false,
    },
  },
  {
    name: "launch_card",
    description:
      "Read-only launch facts for a token contract address on Robinhood Chain (4663): launch, buyer tags and rules, deployer, LP, permissions and sell simulation or its refusal reason. Requires token_card proof-of-work headers. Not investment advice. / 只读查询 Robinhood Chain（4663）代币合约地址的发行事实：发行、买家标签及规则、部署者、流动性仓位、权限和卖出模拟或拒绝原因。需要与 token_card 相同的工作量证明请求头。不构成投资建议。",
    inputSchema: {
      type: "object",
      properties: { address: { type: "string", pattern: addressPattern } },
      required: ["address"],
      additionalProperties: false,
    },
  },
  {
    name: "claim_check",
    description:
      "Read-only deterministic checks on Robinhood Chain (4663), using the same input as /v1/private/opsis/claims: confirm the exact nonzero address with confirmed=true, provide 1–32 structured claims and an optional postTime. Returns agrees, differs or can't check with evidence and reasons. Unknown claim types and tax claims can't be checked. No text or URL fetching. Requires token_card proof-of-work headers. Not investment advice. / 只读确定性核查 Robinhood Chain（4663）事实，输入与 /v1/private/opsis/claims 相同：以 confirmed=true 确认完整非零地址，提供 1–32 项结构化声明及可选 postTime。返回一致、不一致或无法核查，以及证据和原因。未知类型及税费声明无法核查。不抓取文本或链接。需要与 token_card 相同的工作量证明请求头。不构成投资建议。",
    inputSchema: claimInputSchema,
  },
];
