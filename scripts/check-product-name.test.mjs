import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkProductName } from "./check-product-name.mjs";

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "opsis-name-test-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    run(root, (...paths) => execFileSync("git", ["add", "--", ...paths], { cwd: root }));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

const predecessor = (separator = "") => `Chain${separator}Scout`;
const tool = (separator, name) => `Scout${separator}${name}`;

test("finds all required spellings in tracked text with exact line numbers", () => fixture((root, track) => {
  const names = ["", " ", "-", "_"].map(separator => predecessor(separator));
  names.push(predecessor().toLowerCase(), predecessor().toUpperCase(), "chain" + "Scout");
  for (const separator of ["", " ", "-", "_"]) {
    for (const name of ["Watch", "Swap"]) names.push(tool(separator, name));
  }
  names.push(tool(" ", "Watch").toUpperCase(), tool(" ", "Swap").toUpperCase(), "RWA" + " Verify", "No" + "esis", "EURE" + "KA²", "chatgpt" + ".site", "Sco" + "ut", "SCO" + "UT");
  writeFileSync(join(root, "copy.txt"), "Opsis\r\n" + names.join("\r\n"));
  track("copy.txt");
  const found = checkProductName(root, { allow: [] });
  assert.deepEqual(found.map(item => item.line), names.map((_, index) => index + 2));
  assert.deepEqual(found.map(item => item.matches[0]), names);
}));

test("allowlist matches both exact path and case-sensitive matched text", () => fixture((root, track) => {
  const name = predecessor();
  writeFileSync(join(root, "a.txt"), `${name} ${name.toLowerCase()}\n`);
  writeFileSync(join(root, "b.txt"), name);
  track("a.txt", "b.txt");
  const policy = { allow: [{ path: "a.txt", text: name, why: "Compatibility fixture" }] };
  const found = checkProductName(root, policy);
  assert.equal(found.length, 2);
  assert.deepEqual(found[0].matches, [name.toLowerCase()]);
  assert.equal(found[1].path, "b.txt");
  assert.throws(() => checkProductName(root, { allow: [{ path: "a.txt", text: name, why: "" }] }));
}));

test("skips binary and untracked files and permits third-party names", () => fixture((root, track) => {
  writeFileSync(join(root, "binary.bin"), Buffer.from(`\0${predecessor()}`));
  writeFileSync(join(root, "invalid.bin"), Buffer.concat([Buffer.from([255]), Buffer.from(predecessor())]));
  writeFileSync(join(root, "untracked.txt"), predecessor());
  writeFileSync(join(root, "valid.txt"), "Opsis Blockscout blockscout.com Uniswap\n");
  track("binary.bin", "invalid.bin", "valid.txt");
  assert.deepEqual(checkProductName(root, { allow: [] }), []);
}));

test("permits immutable shipped release ids but not the tool brands inside other text", () => fixture((root, track) => {
  const id = (number, name) => `${number}-${tool("-", name).toLowerCase()}`;
  writeFileSync(join(root, "train.txt"), [`"id": "${id("14", "Watch")}"`, `rc/${id("01", "Swap")}/3`, `${id("14", "Watch")} and ${tool(" ", "Watch")}`, tool("-", "Swap").toLowerCase() + "-web"].join("\n"));
  track("train.txt");
  const found = checkProductName(root, { allow: [] });
  assert.deepEqual(found.map(item => item.line), [3, 4]);
  assert.deepEqual(found[0].matches, [tool(" ", "Watch")]);
}));
