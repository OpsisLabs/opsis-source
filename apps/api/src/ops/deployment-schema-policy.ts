/** A missing database is intentional only for an explicitly private launch.
 * Attached databases always retain their migration and deletion checks, even
 * when cloud research is disabled. Runtime config validates all other flags. */
export function deploymentSchemaRequired(env: {
  DATABASE_URL?: string;
  CLOUD_WORKSPACE_ENABLED?: string;
}): boolean {
  if (env.DATABASE_URL) return true;
  if (env.CLOUD_WORKSPACE_ENABLED?.toLowerCase() === "false") return false;
  throw new Error("DATABASE_URL is required unless CLOUD_WORKSPACE_ENABLED is explicitly false");
}
