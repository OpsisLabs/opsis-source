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

const inventory = JSON.parse(execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
}));
const licenses = Object.keys(inventory);
const unapproved = licenses.filter((license) => !approved.has(license));
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
