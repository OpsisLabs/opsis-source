import jwt from "jsonwebtoken";
import type { Env } from "../config/env.js";

export type AccessClaims = {
  sub: string;
  // Email users have no username; wallet users have no email.
  email?: string;
  username?: string;
  role: "USER" | "ADMIN";
};

export function signAccessToken(env: Env, claims: AccessClaims): string {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"],
    issuer: "rh-chain-ai-explorer",
    audience: "rh-chain-ai-explorer-api"
  });
}

export function verifyAccessToken(env: Env, token: string): AccessClaims {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: "rh-chain-ai-explorer",
    audience: "rh-chain-ai-explorer-api"
  }) as AccessClaims;
}
