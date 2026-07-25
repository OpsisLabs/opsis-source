import nodemailer from "nodemailer";
import type { Env } from "../config/env.js";

export class AuthEmailService {
  constructor(private readonly env: Env) {}

  async sendVerification(email: string, token: string): Promise<void> {
    await this.send(email, "Verify your Robinhood Chain Explorer email", "verify-email", token);
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    await this.send(email, "Reset your Robinhood Chain Explorer password", "reset-password", token);
  }

  private async send(email: string, subject: string, path: string, token: string): Promise<void> {
    if (!this.env.SMTP_HOST || !this.env.EMAIL_FROM) return;
    const transport = nodemailer.createTransport({
      host: this.env.SMTP_HOST,
      port: this.env.SMTP_PORT,
      secure: this.env.SMTP_SECURE,
      auth: this.env.SMTP_USER ? { user: this.env.SMTP_USER, pass: this.env.SMTP_PASS } : undefined
    });
    const url = `${this.env.APP_ORIGIN.replace(/\/$/, "")}/${path}?token=${encodeURIComponent(token)}`;
    await transport.sendMail({ from: this.env.EMAIL_FROM, to: email, subject, text: `${subject}: ${url}` });
  }
}
