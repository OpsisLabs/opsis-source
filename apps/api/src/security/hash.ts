import crypto from "node:crypto";
import argon2 from "argon2";

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function hashIp(ip?: string): string | undefined {
  if (!ip) return undefined;
  return sha256(ip);
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}
