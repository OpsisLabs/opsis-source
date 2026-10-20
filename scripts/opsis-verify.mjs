import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { verifyReceipt } from "../packages/shared/dist/receipts.js";
// Reuse the monorepo's existing viem installation; shared primitives stay dependency-free.
const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { keccak256, recoverAddress } = require("viem");
export async function main(args, write = console.log) {
  if (!(args.length === 1 || (args.length === 3 && args[1] === "--keys")) || args[0]?.startsWith("-")) {
    write("Usage: node scripts/opsis-verify.mjs <receipt.json> [--keys <keys.json>]"); return 2;
  }
  try {
    const text = await readFile(args[0], "utf8");
    const keys = args[2] ? JSON.parse(await readFile(args[2], "utf8")) : [];
    const result = await verifyReceipt(text, keys, { keccak256, recoverAddress });
    const { receipt: _receipt, ...checks } = result;
    write(JSON.stringify(checks));
    if (!args[2]) write("No trusted keys supplied; key validity is unverified. Supply --keys for offline verification.");
    return result.valid ? 0 : 1;
  } catch { write("Invalid receipt or key file"); return 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
