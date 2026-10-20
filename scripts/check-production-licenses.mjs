import { execFileSync } from "node:child_process";

const approved = new Set([
  "MIT",
  "MIT-0",
  "Apache-2.0",
  "BSD-3-Clause",
  "0BSD",
  "ISC",
  "BlueOak-1.0.0",
  "SEE LICENSE AT https://gsap.com/standard-license",
  "Standard 'no charge' license: https://gsap.com/standard-license.",
]);
// Anthropic SDK 0.128.0 pulls fast-sha256 1.3.0 through standardwebhooks.
// Its installed LICENSE was reviewed: it expressly permits use, modification
// and distribution for commercial and non-commercial purposes. Keep this
// exception package/version-specific so another Unlicense dependency is not
// admitted without review.
const reviewedUnlicense = new Set(["fast-sha256@1.3.0"]);
// The API renders token card PNGs with resvg-js 2.6.2 (and its per-platform
// binary). MPL-2.0 is file-level copyleft; Opsis uses the package unmodified,
// so no Opsis source is covered. Keep it package/version-specific.
const reviewedMpl = /^@resvg\/resvg-js(-[a-z0-9-]+)?@2\.6\.2$/;

const inventory = JSON.parse(execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
}));
const licenses = Object.keys(inventory);
const unapproved = Object.entries(inventory).flatMap(([license, entries]) =>
  entries
    .filter((entry) => !approved.has(license) && !(license === "Unlicense" && reviewedUnlicense.has(`${entry.name}@${entry.version}`)) && !(license === "MPL-2.0" && reviewedMpl.test(`${entry.name}@${entry.version}`)))
    .map((entry) => `${entry.name}@${entry.version} (${license})`)
);
if (unapproved.length) {
  console.error(`Unreviewed production licenses: ${unapproved.join(", ")}`);
  process.exit(1);
}
for (const packageName of ["gsap", "@gsap/react", "echarts"]) {
  if (!licenses.some((license) => inventory[license]?.some((entry) => entry.name === packageName))) {
    console.error(`Expected reviewed frontend dependency is missing: ${packageName}`);
    process.exit(1);
  }
}
console.log(`PASS: ${licenses.length} production license labels match the reviewed policy.`);
