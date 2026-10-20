import { isAddress } from "viem";

export type PublicContract = Readonly<{ address: string; chain: string }>;
/** Intentionally empty. Publishing an identity and chain needs founder review. */
const unpublishedContract: PublicContract = { address: "", chain: "" };
const allowedChains: Readonly<Record<string, string>> = {
  "4663": "Robinhood Chain · 4663",
  "Robinhood Chain 4663": "Robinhood Chain · 4663",
  "Robinhood Chain · 4663": "Robinhood Chain · 4663",
};

/** Public build settings only. Reject the entire pair if either value is invalid. */
export function parsePublicContract(
  address: unknown,
  chain: unknown,
): PublicContract {
  if (
    typeof address !== "string" ||
    typeof chain !== "string" ||
    !Object.hasOwn(allowedChains, chain) ||
    !/^0x[\da-fA-F]{40}$/.test(address) ||
    /^0x0{40}$/i.test(address) ||
    !isAddress(address, { strict: true })
  )
    return unpublishedContract;
  // Keep the published address's exact spelling, including its checksum casing.
  return { address, chain: allowedChains[chain] };
}

export const publicContract = parsePublicContract(
  import.meta.env.VITE_PUBLIC_CONTRACT_ADDRESS,
  import.meta.env.VITE_PUBLIC_CONTRACT_CHAIN,
);

export function copyableContract(contract: PublicContract): boolean {
  return parsePublicContract(contract.address, contract.chain).address !== "";
}

export async function copyContract(
  contract: PublicContract,
  clipboard: Pick<Clipboard, "writeText"> | undefined,
): Promise<boolean> {
  if (!copyableContract(contract) || !clipboard) return false;
  try {
    await clipboard.writeText(contract.address);
    return true;
  } catch {
    return false;
  }
}
