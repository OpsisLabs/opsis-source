export const openDataSql = {
  "sql.parquetUnavailable":
    "The offline EH engine has no admitted Parquet extension. Loading is refused; no extension is downloaded. A reviewed self-hosted extension is an activation requirement.",
  "sql.title": "SQL on your own files",
  "sql.privacy":
    "Query your own CSV files with SQL, in your browser. Files and queries never leave this device.",
  "sql.loading": "Loading published dataset list…",
  "sql.empty": "No datasets are published yet",
  "sql.datasets": "Choose up to four datasets; each ID becomes a table name",
  "sql.rows": "rows",
  "sql.evidence": "Source, range and limitations",
  "sql.source": "Source",
  "sql.range": "Chain and range",
  "sql.generated": "Generated at",
  "sql.code": "Producer code revision",
  "sql.retry": "Retry dataset list",
  "sql.query": "SQL query",
  "sql.run": "Run locally",
  "sql.cancel": "Cancel",
  "sql.running": "Running in a local worker…",
  "sql.limits":
    "One SELECT or WITH query. 30 seconds including loading, up to 10,000 result rows. External files, URLs, extensions and changes to the database are refused. Not investment advice.",
  "sql.order":
    "Use ORDER BY with a unique tie-breaker for repeatable row order. Replay checks consistency, not source authenticity, rights or freshness.",
  "sql.replay": "Import a run manifest and replay locally",
  "sql.replayLimits":
    "JSON, up to 1 MB. Local replay asks you to pick the original files and checks exact SHA-256 hashes, names, sizes and DuckDB version. Exported manifests contain file names and query text; choose where to keep them.",
  "sql.results": "Query results",
  "sql.export": "Export run manifest",
  "sql.first": "First {n}",
  "sql.matched": "Replay matches the exported result.",
  "sql.unavailable": "SQL is not enabled in this build or deployment.",
  "sql.manifestError":
    "The published dataset list could not be loaded or validated.",
  "sql.fileError":
    "A dataset could not be loaded within its limits, or its row count differs from the manifest.",
  "sql.hashError":
    "Dataset SHA-256 differs from the published manifest. Loading refused.",
  "sql.refused":
    "Query refused. Use one SELECT or WITH statement without external access, file paths, extension commands or volatile time/random functions.",
  "sql.timeout":
    "The 30-second limit was reached. The worker was stopped; no result is inferred.",
  "sql.cancelled": "Cancelled. The worker was stopped and its data cleared.",
  "sql.engineError":
    "The local SQL run could not finish. Check the SQL and dataset selection. Nested result types may be unsupported; no result is inferred.",
  "sql.unsupported":
    "This browser could not start the EH SQL engine. No alternate engine is loaded.",
  "sql.replayError":
    "Replay refused. The file hashes, names, sizes, manifest, engine version or ordered result differ. No match is inferred.",
  "sql.engineSize":
    "The SQL engine is about 8 MB compressed, fetched only when you run your first query.",
  "sql.localLimits":
    "Choose up to 4 CSV files: at most 50 MB each and 100 MB total. Files stay in page memory; closing the page forgets them.",
  "sql.pickFiles": "Choose CSV files",
  "sql.pickReplay": "Pick the same CSV files, in the original order, to replay",
  "sql.schemaAfterRun":
    "Run your first query to parse the CSV files and show columns and row counts.",
  "sql.datasetsNext": "Published Opsis datasets: next.",
  "sql.bytes": "bytes",
  "sql.localLimit":
    "Import refused. Choose 1–4 nonempty CSV files, at most 50 MB each and 100 MB total.",
  "sql.csvError":
    "CSV import refused for this file. Check the .csv file, header and comma-separated rows; malformed rows are not skipped.",
} as const;
