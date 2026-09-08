import { strict as assert } from "node:assert";
import { validateIdentity, validateMessage } from "./identity-guard.mjs";
const policy = { name: "ChainScout", email: "source@chainscout.invalid" };
validateIdentity(policy.name, policy.email, policy);
assert.throws(() => validateIdentity("Personal account", policy.email, policy));
assert.throws(() => validateIdentity(policy.name, "personal@example.test", policy));
validateMessage("fix: preserve encrypted records", policy);
validateMessage(`fix: records\n\nCo-authored-by: ${policy.name} <${policy.email}>`, policy);
for (const trailer of ["Co-authored-by", "Signed-off-by", "Reviewed-by", "Tested-by", "Acked-by", "Reported-by"]) {
  assert.throws(() => validateMessage(`fix: records\n\n${trailer}: Personal account <personal@example.test>`, policy));
}
console.log("Identity policy tests passed (author/email and six attribution trailer types).");
