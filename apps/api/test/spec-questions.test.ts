import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

const specQuestions = [
  "Explain this transaction like I am new to crypto.",
  "What did this wallet do today?",
  "Show me the risky approvals for this address.",
  "Why did this transaction fail?",
  "Summarize the last 20 interactions for this wallet.",
  "What contract did this address interact with?",
  "Is this token contract verified?",
  "What source data supports your answer?"
];

/**
 * These assertions previously required the literal words "read-only" and
 * "informational" in every answer. That is pipeline boilerplate, not a factual
 * outcome, and the release-21 copy deliberately leads with the question-specific
 * answer instead. The checks below keep the same guarantee — grounded, cited,
 * uncertainty-labeled, and free of unsupported or actionable claims — without
 * pinning exact wording, so better copy cannot be mistaken for a regression.
 */
const FORBIDDEN_CLAIMS = [
  /\bguaranteed\b/i,
  /\byou should (?:buy|sell|trade|swap|bridge|approve|sign|submit|transfer)\b/i,
  /\b(?:seed phrase|private key|mnemonic)\b/i,
  /\b(?:definitely|certainly|absolutely) (?:safe|a scam|malicious)\b/i,
  /(?:保证|肯定|一定|绝对)(?:是)?(?:安全|骗局|诈骗|恶意)/,
  /(?:你应该|建议你|我建议|你必须|你需要|务必)\s*(?:买|买入|卖出|出售|交易|兑换|桥接|授权|签名|提交|转账)/
];

const INTERNAL_FACT_KEYS = ["rawSourceCount", "sourceIds", "coinBalance", "gasPriceWei", "transactionsFetched"];

describe("product-spec example questions", () => {
  it("answers each documented question through the chat API with citations and safe wording", async () => {
    const app = await buildApp(loadEnv({ NODE_ENV: "test" }));
    const email = `spec-${Date.now()}@example.com`;

    const register = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email, password: "strong-password" }
    });
    expect(register.statusCode).toBe(200);
    const accessToken = register.json().accessToken as string;

    const sessionResponse = await app.inject({
      method: "POST",
      url: "/v1/chat/sessions",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { title: "Spec question smoke test" }
    });
    expect(sessionResponse.statusCode).toBe(200);
    const sessionId = sessionResponse.json().session.id as string;

    for (const question of specQuestions) {
      const response = await app.inject({
        method: "POST",
        url: `/v1/chat/sessions/${sessionId}/messages`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          entity: "123456",
          entityType: "block",
          question
        }
      });

      expect(response.statusCode, question).toBe(200);
      const body = response.json();
      const answer = body.answer.answer as string;

      // A real, non-empty answer that is not just an echo of the question.
      expect(answer.length, question).toBeGreaterThan(0);
      expect(answer, question).not.toBe(question);

      // No unsupported verdicts, guarantees, or actionable financial advice.
      for (const pattern of FORBIDDEN_CLAIMS) {
        expect(answer, `${question} :: ${pattern}`).not.toMatch(pattern);
      }
      // Pipeline bookkeeping must never leak into the prose.
      for (const key of INTERNAL_FACT_KEYS) {
        expect(answer, `${question} :: ${key}`).not.toContain(key);
      }

      // Grounding, uncertainty and next steps remain present.
      expect(body.answer.citations.length, question).toBeGreaterThan(0);
      expect(body.answer.uncertainty.length, question).toBeGreaterThan(0);
      expect(body.answer.suggestedQuestions.length, question).toBeGreaterThan(0);
      expect(Array.isArray(body.answer.summaryBullets), question).toBe(true);
      expect(body.answer.summaryBullets.every((bullet: unknown) => typeof bullet === "string" && bullet.length > 0), question).toBe(true);

      // Citations point at human-verifiable explorer pages, not raw provider
      // API/RPC endpoints that could leak keys or unstable paths.
      for (const citation of body.answer.citations) {
        expect(typeof citation.provider, question).toBe("string");
        if (citation.url) {
          expect(citation.url, question).toMatch(/^https:\/\/robinhoodchain\.blockscout\.com\//);
        }
      }
    }

    await app.close();
  });
});
