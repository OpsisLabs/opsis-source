import { expect, it } from "vitest";
import { publicIdentity, workspaceLink } from "./model";
it("only hands public identity across workspaces, never amounts or notes", () => {
  const address = "0x" + "a".repeat(40);
  expect(workspaceLink("/check", address)).toBe(`/check?entity=${address}`);
  for (const value of [
    null,
    "wallet note",
    "1.5",
    `${address}&amount=10`,
    "javascript:alert(1)",
    "0x123",
  ])
    expect(publicIdentity(value)).toBe("");
  expect(publicIdentity("0x" + "b".repeat(64))).toHaveLength(66);
});
