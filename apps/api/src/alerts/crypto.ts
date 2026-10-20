import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
/** Keys are deployment secrets, separate from the database and from Vault keys. */
export class AlertCrypto {
  private readonly encryption: Buffer;
  constructor(
    encryptionKey: string,
    private readonly indexKey: string,
  ) {
    if (
      Buffer.byteLength(encryptionKey) < 32 ||
      Buffer.byteLength(indexKey) < 32 ||
      encryptionKey === indexKey
    )
      throw new Error("ALERTS_KEYS_INVALID");
    this.encryption = createHash("sha256").update(encryptionKey).digest();
  }
  index(reference: string): string {
    return createHmac("sha256", this.indexKey)
      .update(`opsis-alerts-telegram-v1:${reference}`)
      .digest("hex");
  }
  encrypt(reference: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryption, nonce);
    cipher.setAAD(Buffer.from("opsis-alerts-telegram-v1"));
    const body = Buffer.concat([
      cipher.update(reference, "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString(
      "base64url",
    );
  }
  decrypt(ciphertext: string): string {
    try {
      const data = Buffer.from(ciphertext, "base64url");
      if (data.length < 29) throw new Error();
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.encryption,
        data.subarray(0, 12),
      );
      decipher.setAAD(Buffer.from("opsis-alerts-telegram-v1"));
      decipher.setAuthTag(data.subarray(12, 28));
      return Buffer.concat([
        decipher.update(data.subarray(28)),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new Error("ALERTS_DECRYPT_FAILED");
    }
  }
}
