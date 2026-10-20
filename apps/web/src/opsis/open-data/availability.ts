import type { Capabilities } from "../model";
export function openDataSqlEnabled(
  capabilities?: Pick<Capabilities, "openDataSql">,
): boolean {
  return (
    import.meta.env.VITE_OPEN_DATA_SQL_ENABLED === "true" &&
    capabilities?.openDataSql === true
  );
}

export function openDataDatasetsEnabled(
  capabilities?: Pick<Capabilities, "openDataSql" | "openDataDatasets">,
): boolean {
  return (
    openDataSqlEnabled(capabilities) &&
    import.meta.env.VITE_OPEN_DATA_DATASETS_ENABLED === "true" &&
    capabilities?.openDataDatasets === true
  );
}
