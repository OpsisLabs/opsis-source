import { expect, test } from "@playwright/test";
import { APP_ORIGIN } from "./support/origin";

const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const UNKNOWN = "0x1111111111111111111111111111111111111111";

function asset(symbol: "WETH" | "USDG", address: string, decimals: number) {
  const name = symbol === "WETH" ? "Wrapped Ether" : "Global Dollar";
  return {
    schemaVersion: 1,
    canonicalId: `eip155:4663/erc20:${address}`,
    chain: { id: 4663, namespace: "eip155", name: "Robinhood Chain" },
    assetType: "erc20",
    address,
    name,
    symbol,
    decimals,
    registryStatus: "opsis_supported",
    identityConfidence: "opsis_reviewed_static_match",
    provenance: { derivation: "opsis_static_review", upstreamPayloadIncluded: false, redistributionClass: "opsis_reviewed_reference", reviewedAt: "2026-08-12T21:31:50.000Z" },
    sources: [{ id: "robinhood-chain-contracts", title: "Robinhood Chain contract reference", url: "https://docs.robinhood.com/chain/contracts/", kind: "primary_reference", purpose: "human_verification_link_only" }, { id: `blockscout-token-${address.toLowerCase()}`, title: `${symbol} contract on the Robinhood Chain explorer`, url: `https://robinhoodchain.blockscout.com/token/${address}`, kind: "human_verification", purpose: "human_verification_link_only" }],
    limitations: ["Reviewed launch-registry reference only.", "Not a safety or value claim."],
  };
}

test("developer page documents and exercises only the two credentialless zero-provider routes", async ({ page }) => {
  const requests: Array<{ url: string; method: string; body: string | null; cookie?: string }> = [];
  await page.context().addCookies([{ name: "cs_access", value: "account-cookie-canary", url: APP_ORIGIN, httpOnly: true, sameSite: "Strict" }]);
  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    requests.push({ url: request.url(), method: request.method(), body: request.postData(), cookie: request.headers().cookie });
    if (request.url().endsWith("/registry")) {
      return route.fulfill({ json: {
        schemaVersion: 1,
        registryVersion: "2026-08-12.1",
        opsisSourceRevision: "1".repeat(40),
        chain: { id: 4663, namespace: "eip155", name: "Robinhood Chain" },
        assets: [asset("WETH", WETH, 18), asset("USDG", USDG, 6)],
        assetsShown: 2,
        completeFor: "opsis_reviewed_launch_registry",
        generatedAt: "2026-08-12T21:31:50.000Z",
        provenance: { upstreamPayloadIncluded: false, redistributionClass: "opsis_reviewed_reference" },
        rights: { opsisAuthored: ["response schema"], excludedFromLicenseClaim: ["third-party marks"] },
        limitations: ["Complete only for the reviewed launch registry."],
        cap: { anonymousRequestsPerHour: 60, scope: "pseudonymous_network_client" },
      } });
    }
    if (request.url().endsWith("/normalize")) {
      return route.fulfill({ json: {
        schemaVersion: 1,
        chain: { id: 4663, namespace: "eip155", name: "Robinhood Chain" },
        kind: "address",
        normalizedValue: UNKNOWN,
        canonicalKey: `eip155:4663/address:${UNKNOWN}`,
        syntaxValid: true,
        existenceVerified: false,
        registryMatch: null,
        explorerUrl: `https://robinhoodchain.blockscout.com/address/${UNKNOWN}`,
        provenance: { derivation: "deterministic_syntax_normalization", upstreamPayloadIncluded: false, redistributionClass: "opsis_derived_normalization", reviewedAt: "2026-08-12T21:31:50.000Z" },
        limitations: ["Syntax only; existence is not verified.", "Explorer link is a handoff only.", "Unknown address; no type is inferred."],
      } });
    }
    return route.abort();
  });

  await page.goto("/developers");
  await expect(page.getByRole("heading", { name: /Useful because the boundary is small/i })).toBeVisible();
  await expect(page.getByText("0 PROVIDER CALLS")).toBeVisible();
  await expect(page.getByText(WETH)).toBeVisible();
  await expect(page.getByText(USDG)).toBeVisible();
  await page.getByLabel("PUBLIC EVM ADDRESS · CHAIN 4663").fill(UNKNOWN);
  await page.getByRole("button", { name: "NORMALIZE", exact: true }).click();
  await expect(page.getByText("SYNTAX VALID · EXISTENCE NOT VERIFIED")).toBeVisible();
  await expect(page.getByText("Not in the reviewed launch registry; no asset type is inferred.")).toBeVisible();

  const registryRequests = requests.filter((request) => request.url.endsWith("/registry"));
  const normalizeRequests = requests.filter((request) => request.url.endsWith("/normalize"));
  expect(registryRequests.length).toBeGreaterThanOrEqual(1);
  expect(registryRequests.every((request) => request.method === "GET" && request.body === null && request.cookie === undefined)).toBe(true);
  expect(normalizeRequests).toEqual([expect.objectContaining({ method: "POST", body: JSON.stringify({ chainId: 4663, kind: "evm_address", value: UNKNOWN }), cookie: undefined })]);
  expect(requests.every((request) => !request.url.includes(WETH) && !request.url.includes(UNKNOWN))).toBe(true);
  expect(requests.some((request) => /auth|wallet|portfolio|transaction|search|bulk/.test(request.url))).toBe(false);
});
