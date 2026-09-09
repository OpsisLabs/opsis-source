import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// The reviewed public mirror deliberately excludes private deployment workflows.
if (!existsSync(new URL("../.github/workflows/production-smoke.yml", import.meta.url))
    && existsSync(new URL("../.github/workflows/public-verify.yml", import.meta.url))
    && !existsSync(new URL("../.github/workflows/release-gates.yml", import.meta.url))) {
  console.log("SKIP: the public source mirror does not distribute operator alert workflows.");
  process.exit(0);
}

const workflow = readFileSync(new URL("../.github/workflows/production-smoke.yml", import.meta.url), "utf8");
const drill = workflow.split("  notification-drill:\n")[1]?.split("  verify:\n")[0];
const verify = workflow.split("  verify:\n")[1];
assert.ok(drill && verify, "keep the notification drill separate from live verification");
assert.match(workflow, /notification_test:[\s\S]*?type: boolean[\s\S]*?default: false/);
assert.match(workflow, /group: \$\{\{ inputs\.notification_test && 'production-notification-drill' \|\| 'production-smoke' \}\}/);
assert.match(drill, /github\.event_name == 'workflow_dispatch' && inputs\.notification_test/);
assert.match(drill, /permissions: \{\}/);
assert.match(drill, /timeout-minutes: 1/);
assert.match(drill, /exit 1/);
assert.doesNotMatch(drill, /uses:|curl|fetch\(|railway|launch:smoke|secrets\./i);
assert.match(verify, /if: \$\{\{ !inputs\.notification_test \}\}/);
assert.match(verify, /run: pnpm launch:smoke/);
assert.match(workflow, /cron: "17,47 \* \* \* \*"/);
console.log("PASS: alert drill is explicit, isolated, unprivileged and cannot cancel the scheduled smoke.");
