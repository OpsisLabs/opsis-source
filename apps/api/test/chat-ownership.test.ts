import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

describe("chat session ownership", () => {
  it("does not expose or accept messages for another user's session", async () => {
    const app = await buildApp(loadEnv({ NODE_ENV: "test" }));
    const suffix = `${Date.now()}-${Math.random()}`;

    const owner = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email: `owner-${suffix}@example.com`, password: "strong-password" }
    });
    const other = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email: `other-${suffix}@example.com`, password: "strong-password" }
    });
    const ownerToken = owner.json().accessToken as string;
    const otherToken = other.json().accessToken as string;

    const created = await app.inject({
      method: "POST",
      url: "/v1/chat/sessions",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { title: "Private analysis" }
    });
    const sessionId = created.json().session.id as string;

    const sessions = await app.inject({
      method: "GET",
      url: "/v1/chat/sessions",
      headers: { authorization: `Bearer ${otherToken}` }
    });
    expect(sessions.statusCode).toBe(200);
    expect(sessions.json().sessions).toEqual([]);

    const hiddenMessages = await app.inject({
      method: "GET",
      url: `/v1/chat/sessions/${sessionId}/messages`,
      headers: { authorization: `Bearer ${otherToken}` }
    });
    expect(hiddenMessages.statusCode).toBe(404);

    const ownerSend = await app.inject({
      method: "POST",
      url: `/v1/chat/sessions/${sessionId}/messages`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { entity: "123456", entityType: "block", question: "What happened?" }
    });
    expect(ownerSend.statusCode).toBe(200);
    const ownerMessages = await app.inject({
      method: "GET",
      url: `/v1/chat/sessions/${sessionId}/messages`,
      headers: { authorization: `Bearer ${ownerToken}` }
    });
    expect(ownerMessages.statusCode).toBe(200);
    expect(ownerMessages.json().messages.map((message: { role: string }) => message.role)).toEqual(["USER", "ASSISTANT"]);

    const send = await app.inject({
      method: "POST",
      url: `/v1/chat/sessions/${sessionId}/messages`,
      headers: { authorization: `Bearer ${otherToken}` },
      payload: { entity: "123456", entityType: "block", question: "What happened?" }
    });
    expect(send.statusCode).toBe(404);
    expect(send.json().error.code).toBe("NOT_FOUND");

    await app.close();
  });
});
