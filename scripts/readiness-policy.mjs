// Require the caller to choose the release scope. The default remains the
// original strict cloud gate; a private-only result must explicitly prove that
// server-side chat creation is disabled rather than silently accepting memory.
export function readinessPasses(body, scope = "cloud") {
  if (!["cloud", "private-only"].includes(scope)) throw new Error("Readiness scope must be cloud or private-only");
  if (!body || body.ok !== true || body.redis !== "up") return false;
  if (scope === "cloud") return body.database === "up" && body.retention?.status === "up" && body.cloudWorkspace !== "disabled";
  return body.deploymentMode === "private-only" && body.cloudWorkspace === "disabled"
    && ((body.database === "memory" && body.retention?.status === "disabled")
      || (body.database === "up" && body.retention?.status === "up"));
}
