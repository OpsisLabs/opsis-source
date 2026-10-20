import { isAddress } from "viem";

export type PublicContract = Readonly<{ address: string; chain: string }>;
/** Returned for any invalid pair, so a bad setting never shows a wrong address. */
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

/** The founder-published Opsis (OPSIS) token on Robinhood Chain (D34). */
export const publishedContract: PublicContract = {
  address: "0x75cb4182Db44f816d80e946F0b84dBC29e5cf58A",
  chain: "Robinhood Chain · 4663",
};

const settingAddress = import.meta.env.VITE_PUBLIC_CONTRACT_ADDRESS;
const settingChain = import.meta.env.VITE_PUBLIC_CONTRACT_CHAIN;
/** Build settings may replace the published pair; an invalid pair still fails closed. */
export const publicContract =
  settingAddress || settingChain
    ? parsePublicContract(settingAddress, settingChain)
    : parsePublicContract(publishedContract.address, publishedContract.chain);

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
