export const openDataSql = {
  "sql.parquetUnavailable":
    "离线 EH 引擎没有已准入的 Parquet 扩展。已拒绝加载，未下载扩展。启用前需要经审查的自托管扩展。",
  "sql.title": "对自己的文件运行 SQL",
  "sql.privacy":
    "在浏览器中用 SQL 查询自己的 CSV 文件。文件和查询不会离开此设备。",
  "sql.loading": "正在加载已发布数据集列表…",
  "sql.empty": "尚未发布任何数据集",
  "sql.datasets": "最多选择四个数据集；每个 ID 对应一个表名",
  "sql.rows": "行",
  "sql.evidence": "来源、范围及局限",
  "sql.source": "来源",
  "sql.range": "链及范围",
  "sql.generated": "生成时间",
  "sql.code": "生成代码版本",
  "sql.retry": "重试数据集列表",
  "sql.query": "SQL 查询",
  "sql.run": "本地运行",
  "sql.cancel": "取消",
  "sql.running": "正在本地工作线程中运行…",
  "sql.limits":
    "仅限一条 SELECT 或 WITH 查询。含加载在内限时 30 秒，最多返回 10,000 行。拒绝外部文件、网址、扩展及数据库修改。非投资建议。",
  "sql.order":
    "使用带唯一排序键的 ORDER BY 以保持行顺序可重复。重放检查一致性，不验证来源真实性、使用权或时效性。",
  "sql.replay": "导入运行清单并本地重放",
  "sql.replayLimits":
    "JSON 文件不超过 1 MB。本地重放要求重新选择原文件，并核对 SHA-256 哈希、名称、大小及 DuckDB 版本。导出清单包含文件名和查询文本，请自行选择保存位置。",
  "sql.results": "查询结果",
  "sql.export": "导出运行清单",
  "sql.first": "前 {n} 行",
  "sql.matched": "重放结果与导出结果一致。",
  "sql.unavailable": "此构建或部署未启用 SQL。",
  "sql.manifestError": "无法加载或验证已发布数据集列表。",
  "sql.fileError": "无法在限制内加载数据集，或行数与清单不同。",
  "sql.hashError": "数据集 SHA-256 与已发布清单不符，已拒绝加载。",
  "sql.refused":
    "查询已拒绝。仅可使用一条 SELECT 或 WITH 语句，不得访问外部资源、文件路径、扩展命令或易变的时间及随机函数。",
  "sql.timeout": "已达到 30 秒限制，工作线程已停止，不推断结果。",
  "sql.cancelled": "已取消。工作线程已停止，其数据已清除。",
  "sql.engineError":
    "本地 SQL 运行未能完成，请检查 SQL 和数据集选择。嵌套结果类型可能不受支持，不推断结果。",
  "sql.unsupported": "此浏览器无法启动 EH SQL 引擎，未加载其他引擎。",
  "sql.replayError":
    "已拒绝重放。文件哈希、名称、大小、清单、引擎版本或有序结果不符，不推断匹配。",
  "sql.engineSize": "SQL 引擎压缩后约 8 MB，仅在首次运行查询时获取。",
  "sql.localLimits":
    "最多选择 4 个 CSV 文件：每个不超过 50 MB，总计不超过 100 MB。文件仅保留在页面内存中，关闭页面即忘记。",
  "sql.pickFiles": "选择 CSV 文件",
  "sql.pickReplay": "按原顺序选择相同的 CSV 文件以重放",
  "sql.schemaAfterRun": "首次运行查询时解析 CSV 文件，并显示列和行数。",
  "sql.datasetsNext": "Opsis 已发布数据集：下一步。",
  "sql.bytes": "字节",
  "sql.localLimit":
    "已拒绝导入。请选择 1–4 个非空 CSV 文件，每个不超过 50 MB，总计不超过 100 MB。",
  "sql.csvError":
    "已拒绝导入此 CSV 文件。请检查 .csv 文件、表头及逗号分隔的行；不会跳过格式错误的行。",
} as const;
