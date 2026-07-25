import { z } from "zod";
import type { Env } from "../config/env.js";
import { hashPassword, randomToken, verifyPassword } from "../security/hash.js";
import { signAccessToken } from "../security/jwt.js";
import type { AuthRepository, AuthUser } from "./repository.js";
import { WalletAuthError, normalizeUsername, verifySignedNonce } from "./wallet.js";
import type { AuthEmailService } from "./email.js";

export const authBodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(10).max(200)
});

export type AuthResult = {
  user: Pick<AuthUser, "id" | "email" | "username" | "walletAddress" | "role" | "status">;
  accessToken: string;
  refreshToken: string;
};

export type RegistrationResult = Partial<Pick<AuthResult, "accessToken" | "refreshToken">> & {
  user: AuthResult["user"];
  verificationRequired: boolean;
  verificationToken?: string;
};

function refreshExpiry(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date;
}

function expiryInMinutes(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

export class AuthService {
  constructor(
    private readonly env: Env,
    private readonly repo: AuthRepository,
    private readonly email: AuthEmailService
  ) {}

  async register(email: string, password: string, userAgent?: string, ip?: string): Promise<RegistrationResult> {
    const existing = await this.repo.findByEmail(email);
    if (existing) throw new Error("EMAIL_ALREADY_REGISTERED");
    const user = await this.repo.createUser(email, await hashPassword(password));
    const verificationToken = await this.issueVerification(user);
    if (this.env.NODE_ENV === "production") {
      return { user: publicUser(user), verificationRequired: true };
    }
    return { ...(await this.issue(user, userAgent, ip)), verificationRequired: false, verificationToken };
  }

  async login(email: string, password: string, userAgent?: string, ip?: string): Promise<AuthResult> {
    const user = await this.repo.findByEmail(email);
    // A wallet-only account has no password hash and cannot be logged into here.
    if (!user || user.status !== "ACTIVE" || !user.passwordHash) throw new Error("INVALID_CREDENTIALS");
    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) throw new Error("INVALID_CREDENTIALS");
    if (this.env.NODE_ENV === "production" && !user.emailVerifiedAt) throw new Error("EMAIL_NOT_VERIFIED");
    return this.issue(user, userAgent, ip);
  }

  async verifyEmail(token: string, userAgent?: string, ip?: string): Promise<AuthResult> {
    const user = await this.repo.verifyEmail(token);
    if (!user || user.status !== "ACTIVE") throw new Error("INVALID_AUTH_TOKEN");
    return this.issue(user, userAgent, ip);
  }

  async resendVerification(email: string): Promise<string | undefined> {
    const user = await this.repo.findByEmail(email);
    if (!user || user.status !== "ACTIVE" || user.emailVerifiedAt) return undefined;
    return this.issueVerification(user);
  }

  async requestPasswordReset(email: string): Promise<string | undefined> {
    const user = await this.repo.findByEmail(email);
    if (!user || user.status !== "ACTIVE" || !user.email) return undefined;
    const token = randomToken();
    await this.repo.storeAuthToken(user.id, token, "PASSWORD_RESET", expiryInMinutes(60));
    await this.email.sendPasswordReset(user.email, token);
    return this.env.NODE_ENV === "production" ? undefined : token;
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const user = await this.repo.resetPassword(token, await hashPassword(password));
    if (!user) throw new Error("INVALID_AUTH_TOKEN");
  }

  async refresh(refreshToken: string, userAgent?: string, ip?: string): Promise<AuthResult> {
    const nextRefresh = randomToken();
    const user = await this.repo.rotateRefreshToken(refreshToken, nextRefresh, refreshExpiry(), userAgent, ip);
    if (!user) throw new Error("INVALID_REFRESH_TOKEN");
    if (this.env.NODE_ENV === "production" && !user.emailVerifiedAt) throw new Error("INVALID_REFRESH_TOKEN");
    return {
      user: publicUser(user),
      accessToken: signAccessToken(this.env, claimsFor(user)),
      refreshToken: nextRefresh
    };
  }

  async logout(refreshToken: string): Promise<string | undefined> {
    return this.repo.revokeRefreshToken(refreshToken);
  }

  /**
   * Sign in with a wallet signature. A wallet seen for the first time needs a
   * username, so the caller gets USERNAME_REQUIRED and can retry with one —
   * reusing the same nonce and signature, which stays valid for its full window
   * so the user is never asked to sign twice.
   */
  async loginWithWallet(
    nonce: string,
    signature: string,
    username?: string,
    userAgent?: string,
    ip?: string
  ): Promise<AuthResult> {
    const address = await verifySignedNonce(this.env, nonce, signature);

    const existing = await this.repo.findByWallet(address);
    if (existing) {
      if (existing.status !== "ACTIVE") throw new WalletAuthError("ACCOUNT_DISABLED", "This account is disabled");
      return this.issue(existing, userAgent, ip);
    }

    if (!username) {
      throw new WalletAuthError("USERNAME_REQUIRED", "Choose a username for this wallet");
    }
    const normalized = normalizeUsername(username);
    if (await this.repo.isUsernameTaken(normalized)) {
      throw new WalletAuthError("USERNAME_TAKEN", "That username is already taken");
    }
    const created = await this.repo.createWalletUser(address, normalized);
    return this.issue(created, userAgent, ip);
  }

  private async issue(user: AuthUser, userAgent?: string, ip?: string): Promise<AuthResult> {
    const refreshToken = randomToken();
    await this.repo.storeRefreshToken(user.id, refreshToken, refreshExpiry(), userAgent, ip);
    return {
      user: publicUser(user),
      accessToken: signAccessToken(this.env, claimsFor(user)),
      refreshToken
    };
  }

  private async issueVerification(user: AuthUser): Promise<string> {
    if (!user.email) throw new Error("EMAIL_REQUIRED");
    const token = randomToken();
    await this.repo.storeAuthToken(user.id, token, "EMAIL_VERIFICATION", expiryInMinutes(24 * 60));
    await this.email.sendVerification(user.email, token);
    return token;
  }
}

function claimsFor(user: AuthUser) {
  return {
    sub: user.id,
    ...(user.email ? { email: user.email } : {}),
    ...(user.username ? { username: user.username } : {}),
    role: user.role
  };
}

function publicUser(user: AuthUser): AuthResult["user"] {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    walletAddress: user.walletAddress,
    role: user.role,
    status: user.status
  };
}
