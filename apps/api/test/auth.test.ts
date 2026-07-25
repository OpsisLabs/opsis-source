import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { memoryStore } from "../src/db/memory.js";
import { sha256 } from "../src/security/hash.js";

describe("auth routes", () => {
  it("records the authentication lifecycle without sensitive metadata", async () => {
    const app = await buildApp(loadEnv({ NODE_ENV: "test" }));
    const email = `auth-${Date.now()}-${Math.random()}@example.com`;
    const register = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email, password: "strong-password" }
    });
    expect(register.statusCode).toBe(200);
    const userId = register.json().user.id as string;
    const verificationToken = register.json().verificationToken as string;

    const verifyEmail = await app.inject({
      method: "POST",
      url: "/v1/auth/verify-email",
      payload: { token: verificationToken }
    });
    expect(verifyEmail.statusCode).toBe(200);

    const reusedVerification = await app.inject({
      method: "POST",
      url: "/v1/auth/verify-email",
      payload: { token: verificationToken }
    });
    expect(reusedVerification.statusCode).toBe(400);

    const duplicateRegister = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email, password: "strong-password" }
    });
    expect(duplicateRegister.statusCode).toBe(409);

    const failedLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email, password: "incorrect-password" }
    });
    expect(failedLogin.statusCode).toBe(401);

    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email, password: "strong-password" }
    });
    expect(login.statusCode).toBe(200);

    const refresh = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: login.json().refreshToken }
    });
    expect(refresh.statusCode).toBe(200);

    const forgotPassword = await app.inject({
      method: "POST",
      url: "/v1/auth/forgot-password",
      payload: { email }
    });
    expect(forgotPassword.statusCode).toBe(202);
    const resetToken = forgotPassword.json().resetToken as string;

    const resetPassword = await app.inject({
      method: "POST",
      url: "/v1/auth/reset-password",
      payload: { token: resetToken, password: "new-strong-password" }
    });
    expect(resetPassword.statusCode).toBe(200);

    const revokedRefresh = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: refresh.json().refreshToken }
    });
    expect(revokedRefresh.statusCode).toBe(401);

    const oldPasswordLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email, password: "strong-password" }
    });
    expect(oldPasswordLogin.statusCode).toBe(401);

    const newPasswordLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email, password: "new-strong-password" }
    });
    expect(newPasswordLogin.statusCode).toBe(200);

    const unknownReset = await app.inject({
      method: "POST",
      url: "/v1/auth/forgot-password",
      payload: { email: `missing-${email}` }
    });
    expect(unknownReset.statusCode).toBe(202);
    expect(unknownReset.json().resetToken).toBeUndefined();

    const failedRefresh = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: "invalid-refresh-token" }
    });
    expect(failedRefresh.statusCode).toBe(401);

    const logout = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      payload: { refreshToken: newPasswordLogin.json().refreshToken }
    });
    expect(logout.statusCode).toBe(200);

    const me = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { authorization: `Bearer ${login.json().accessToken}` }
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe(email);

    const actions = memoryStore.auditLogs.filter((log) => log.userId === userId).map((log) => log.action);
    expect(actions).toEqual([
      "AUTH_REGISTER_SUCCEEDED",
      "AUTH_EMAIL_VERIFIED",
      "AUTH_LOGIN_SUCCEEDED",
      "AUTH_REFRESH_SUCCEEDED",
      "AUTH_LOGIN_SUCCEEDED",
      "AUTH_LOGOUT"
    ]);
    const failedLoginAudit = memoryStore.auditLogs.find(
      (log) => log.action === "AUTH_LOGIN_FAILED" && log.metadata?.emailHash === sha256(email.toLowerCase())
    );
    const rejectedRegisterAudit = memoryStore.auditLogs.find(
      (log) => log.action === "AUTH_REGISTER_REJECTED" && log.metadata?.emailHash === sha256(email.toLowerCase())
    );
    expect(failedLoginAudit).toBeDefined();
    expect(rejectedRegisterAudit).toBeDefined();
    expect(memoryStore.auditLogs.some((log) => log.action === "AUTH_REFRESH_FAILED")).toBe(true);
    expect(memoryStore.auditLogs.find((log) => log.action === "AUTH_LOGOUT" && log.userId === userId)?.metadata).toEqual({
      tokenFound: true
    });
    expect(JSON.stringify(memoryStore.auditLogs)).not.toContain(email);
    expect(JSON.stringify(memoryStore.auditLogs)).not.toContain(login.json().refreshToken);
    expect(JSON.stringify(memoryStore.auditLogs)).not.toContain(resetToken);
    await app.close();
  });
});
