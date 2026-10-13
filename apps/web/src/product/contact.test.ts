import { describe, expect, it } from "vitest";
import { contactAddresses } from "./contact";

describe("deployment contact addresses", () => {
  it.each([undefined, "", "   "])(
    "keeps contact unpublished for blank support (%s)",
    (value) => {
      expect(contactAddresses(value, undefined)).toBeNull();
      expect(contactAddresses(value, "")).toBeNull();
      expect(() => contactAddresses(value, "security@opsis.example")).toThrow(
        "VITE_SECURITY_EMAIL requires VITE_SUPPORT_EMAIL",
      );
    },
  );

  it("normalizes ASCII case and defaults security to support", () => {
    expect(contactAddresses("SUPPORT@OPSIS.EXAMPLE", undefined)).toEqual({
      support: "support@opsis.example",
      security: "support@opsis.example",
    });
    expect(contactAddresses("support@opsis.example", "   ")?.security).toBe(
      "support@opsis.example",
    );
    expect(
      contactAddresses("support@opsis.example", "SECURITY@OPSIS.EXAMPLE"),
    ).toEqual({
      support: "support@opsis.example",
      security: "security@opsis.example",
    });
    expect(
      contactAddresses("support.test+reports_1-2@sub.opsis.example", "")
        ?.support,
    ).toBe("support.test+reports_1-2@sub.opsis.example");
  });

  it("accepts at most 254 characters", () => {
    const limit = `${"a".repeat(240)}@opsis.example`;
    expect(limit).toHaveLength(254);
    expect(contactAddresses(limit, undefined)?.support).toBe(limit);
    expect(() => contactAddresses(`a${limit}`, undefined)).toThrow(
      "VITE_SUPPORT_EMAIL",
    );
  });

  it.each([
    "not-an-email",
    "support@localhost",
    "support@@opsis.example",
    "@opsis.example",
    "support@.example",
    "support@opsis..example",
    "support@-opsis.example",
    "support@opsis-.example",
    "support@opsis.example.",
    `support@${"a".repeat(64)}.example`,
    "支持@opsis.example",
    "support@例子.example",
    "supportK@opsis.example",
    "support @opsis.example",
    " support@opsis.example",
    "support@opsis.example ",
    "support\t@opsis.example",
    "support@opsis.example\n",
    "support@opsis.example\r\nContact: injected",
    "\n",
    '"support"@opsis.example',
    "'support'@opsis.example",
    "<support@opsis.example>",
    "mailto:support@opsis.example",
    "a@b.example, c@d.example",
    "support@opsis.example;security@opsis.example",
    "support@opsis.example security@opsis.example",
  ])("rejects malformed support and security values (%s)", (value) => {
    expect(() => contactAddresses(value, undefined)).toThrow(
      "VITE_SUPPORT_EMAIL must be one plain ASCII email address",
    );
    expect(() => contactAddresses("support@opsis.example", value)).toThrow(
      "VITE_SECURITY_EMAIL must be one plain ASCII email address",
    );
    expect(() => contactAddresses(undefined, value)).toThrow(
      "VITE_SECURITY_EMAIL",
    );
  });
});
