/** Only public identifiers cross workspace URLs. Never spread search params. */
export function publicIdentity(value: string | null): string {
  const candidate = value?.trim() ?? "";
  return /^0x(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(candidate)
    ? candidate
    : "";
}
export function workspaceLink(
  path: "/research" | "/check",
  value: string,
): string {
  const id = publicIdentity(value);
  return id ? `${path}?entity=${encodeURIComponent(id)}` : path;
}
export type Capabilities = {
  expiresAt: string;
  chainId: 4663;
  research: boolean;
  exitCheck: boolean;
  watch: boolean;
  rwa: boolean;
  observedTrades: boolean;
  perpExecution: false;
};
export async function unlockPreview(
  key: string,
  signal: AbortSignal,
): Promise<Capabilities> {
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL ?? ""}/v1/private/opsis/access`,
    {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      signal,
      headers: {
        authorization: `Preview ${key}`,
        "content-type": "application/json",
        "x-chainscout-csrf": "1",
      },
      body: "{}",
    },
  );
  if (!response.ok) throw new Error("Preview unavailable");
  const data: Capabilities = await response.json();
  const expires = Date.parse(data.expiresAt);
  const receivedAt = Date.now();
  // HTTP Date has whole-second precision. Validate the server's lifetime against
  // its own clock, then cap our local session to one hour independently.
  const dateHeader = response.headers.get("date");
  const serverNow = dateHeader === null ? receivedAt : Date.parse(dateHeader);
  const latestExpiry = serverNow + 3_600_000 + (dateHeader === null ? 0 : 999);
  if (
    !Number.isFinite(expires) ||
    !Number.isFinite(serverNow) ||
    expires <= receivedAt ||
    expires > latestExpiry ||
    data.chainId !== 4663 ||
    data.perpExecution !== false ||
    [
      data.research,
      data.exitCheck,
      data.watch,
      data.rwa,
      data.observedTrades,
    ].some((v) => typeof v !== "boolean")
  ) {
    throw new Error("Invalid preview response");
  }
  return {
    ...data,
    expiresAt: new Date(
      Math.min(expires, receivedAt + 3_600_000),
    ).toISOString(),
  };
}
