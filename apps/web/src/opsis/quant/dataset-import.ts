import { parseCsv, validateDataset, type PriceDataset } from "@rh-chain/quant";

export type DatasetImport = { text: string; csv: boolean; observedAt: string };

export function buildImportedDataset(
  file: DatasetImport,
  metadata: Omit<PriceDataset, "observations">,
  now = new Date(),
): { dataset: PriceDataset | null; error: string } {
  try {
    const loaded = file.csv ? parseCsv(file.text, metadata) : JSON.parse(file.text);
    // The pre-run card needs at least two observations to show a dated range.
    const check = validateDataset(loaded, now, { minimumReturns: 1 });
    return {
      dataset: check.dataset ?? null,
      error: check.issues.map((issue) => issue.message).join(" "),
    };
  } catch (error) {
    return { dataset: null, error: file.csv && error instanceof Error
      ? error.message
      : "Could not parse JSON. Provide a valid dataset object." };
  }
}

const diagnosticCopy: Record<string, string> = {
  "Dataset must be an object with explicit metadata and observations.": "数据集必须是包含明确元数据和 observations 的对象。",
  "schemaVersion 1 and instrument identity are required.": "必须提供 schemaVersion 1 和 instrument 资产标识。",
  "quoteCurrency must be an explicit currency code.": "quoteCurrency 必须是明确的货币代码。",
  "Only daily crypto 24/7 observations are supported.": "仅支持每日全天候加密资产观察数据；clock 必须为 daily_crypto_24_7。",
  "source and observedAt provenance are required.": "必须提供来源信息 source 和 observedAt。",
  "Instrument needs a safe chainId, 20-byte address and symbol.": "instrument 需要有效的正整数 chainId、20 字节 address 和 symbol。",
  "Provenance needs source, safe observedAt and an optional HTTPS source URL.": "provenance 需要 source、有效的 observedAt；可选来源网址必须使用 HTTPS。",
  "synthetic must be boolean when present.": "如提供 synthetic，其值必须为布尔值。",
  "Each observation must contain date and price.": "每条观察必须包含 date 和 price。",
  "Dates must use YYYY-MM-DD calendar dates.": "日期必须使用有效的 YYYY-MM-DD 日历日期。",
  "Price must be finite, positive and within numeric bounds.": "price 必须为有限正数，且在数值范围内。",
  "Dates must be strictly ascending; rows are never silently sorted.": "日期必须严格递增；系统不会自动排序数据行。",
  "The current UTC day is incomplete; provide a closed daily observation.": "当前 UTC 日期尚未结束；请提供已结束日期的每日观察。",
  "observedAt must be an ISO timestamp.": "observedAt 必须是 ISO 时间戳。",
  "observedAt must be on or after the final closed observation.": "observedAt 必须在最后一个完整观察日结束之后，且不能晚于当前时间。",
  "Could not parse JSON. Provide a valid dataset object.": "无法解析 JSON。请提供有效的数据集对象。",
  "CSV needs a header and at least one row.": "CSV 需要表头和至少一行数据。",
  "CSV must have date and price columns.": "CSV 必须包含 date 和 price 列。",
  "Files are limited to 2 MB for this local run.": "本地运行文件限制为 2 MB。",
  "Could not read this file.": "无法读取该文件，请重新选择文件。",
  "The local worker could not start.": "本地工作线程无法启动。",
  "The local worker failed before producing a result.": "本地工作线程未能生成结果。",
  "Run cancelled. Input cleared from the worker.": "运行已取消。工作线程中的输入已清除。",
  "Run refused.": "运行被拒绝。请检查数据集和实验参数。",
};

export function datasetDiagnosticChinese(message: string): string {
  let translated = message;
  for (const [en, zh] of Object.entries(diagnosticCopy)) translated = translated.replaceAll(en, zh);
  translated = translated
    .replace(/observations must be an array of at most (\d+) rows\./g, "observations 必须为数组，最多包含 $1 行。")
    .replace(/Duplicate date (\S+); rows are never silently merged\./g, "日期 $1 重复；系统不会自动合并数据行。")
    .replace(/Expected consecutive daily observations between (\S+) and (\S+); found (\S+) days\./g, "$1 与 $2 之间应为连续每日观察；实际间隔为 $3 天。")
    .replace(/At least (\d+) daily returns are required for this method\./g, "此方法至少需要 $1 个每日收益。")
    .replace(/CSV is limited to (\d+) observations\./g, "CSV 最多支持 $1 条观察。");
  return translated === message && !/[\u3400-\u9fff]/.test(translated)
    ? "数据或实验参数未通过验证。请检查资产标识、报价货币、来源、完整连续的每日日期和正数价格。"
    : translated;
}
