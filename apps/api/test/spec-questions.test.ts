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
          entity: "documented-question-fixture",
          entityType: "unknown",
          question
        }
      });

      expect(response.statusCode, question).toBe(200);
      const body = response.json();
      expect(body.answer.answer, question).toContain("read-only");
      expect(body.answer.answer, question).toContain("informational");
      expect(body.answer.citations.length, question).toBeGreaterThan(0);
      expect(body.answer.uncertainty.length, question).toBeGreaterThan(0);
      expect(body.answer.suggestedQuestions.length, question).toBeGreaterThan(0);
    }

    await app.close();
  });
});
