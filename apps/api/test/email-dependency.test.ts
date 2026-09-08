import { describe, expect, it } from "vitest";
import nodemailer from "nodemailer";

describe("patched email dependency", () => {
  it("formats a single-recipient message without contacting an SMTP server", async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const result = await transport.sendMail({
      from: "sender@example.test", to: "recipient@example.test",
      subject: "Offline verification fixture", text: "Not delivered to anyone.",
    });
    expect(result.envelope.to).toEqual(["recipient@example.test"]);
    expect(JSON.parse(result.message).text).toBe("Not delivered to anyone.");
  });

  it("rejects recipients over the patched parser's explicit cap instead of truncating", async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const message = {
      from: "sender@example.test", to: ["one@example.test", "two@example.test"],
      subject: "Offline cap fixture", text: "Not delivered to anyone.",
      maxRecipients: 1,
    };
    await expect(transport.sendMail(message)).rejects.toMatchObject({ code: "EMAXRECIPIENTS" });
  });
});
