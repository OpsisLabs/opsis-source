import { lazy, Suspense } from "react";
import { useI18n } from "../../i18n";
import type { Capabilities } from "../model";
import { openDataSqlEnabled, openDataDatasetsEnabled } from "./availability";
const SqlWorkspace = lazy(() => import("./SqlWorkspace"));
/** No component mount, import, request or engine load while either gate is off. */
export default function SqlAccess({
  capabilities,
}: {
  capabilities?: Pick<Capabilities, "openDataSql" | "openDataDatasets">;
}) {
  const { t } = useI18n();
  if (!openDataSqlEnabled(capabilities)) return null;
  return (
    <Suspense fallback={<p role="status">{t("sql.loading")}</p>}>
      <SqlWorkspace datasetsEnabled={openDataDatasetsEnabled(capabilities)} />
    </Suspense>
  );
}
