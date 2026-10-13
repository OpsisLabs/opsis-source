export type ContactAddresses = { support: string; security: string };

function address(raw: string | undefined, setting: string): string | null {
  if (raw === undefined || raw === "") return null;
  if (!/[\r\n]/.test(raw) && raw.trim() === "") return null;
  const value = raw.toLowerCase();
  if (
    /[^\x21-\x7e]/.test(raw) ||
    value.length > 254 ||
    !/^[a-z0-9._+-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
      value,
    )
  ) {
    throw new Error(
      `${setting} must be one plain ASCII email address (at most 254 characters, with a dotted domain and no spaces, quotes or separators)`,
    );
  }
  return value;
}

export function contactAddresses(
  rawSupport: string | undefined,
  rawSecurity: string | undefined,
): ContactAddresses | null {
  const support = address(rawSupport, "VITE_SUPPORT_EMAIL");
  const security = address(rawSecurity, "VITE_SECURITY_EMAIL");
  if (!support) {
    if (security)
      throw new Error("VITE_SECURITY_EMAIL requires VITE_SUPPORT_EMAIL");
    return null;
  }
  return { support, security: security ?? support };
}
