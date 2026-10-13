export type TradeRefusal = { code: string; status: number; retryAfter?: number };

export function tradeRefusal(error: unknown): TradeRefusal {
  if (!error || typeof error !== "object") return { code: "", status: 0 };
  const value = error as Record<string, unknown>;
  return {
    code: typeof value.code === "string" ? value.code : "",
    status: typeof value.status === "number" ? value.status : 0,
    ...(typeof value.retryAfter === "number" && Number.isFinite(value.retryAfter) && value.retryAfter > 0 ? { retryAfter: value.retryAfter } : {}),
  };
}

export function tradeRefusalCopy(error: TradeRefusal): [string, string] {
  if (error.status === 429 || error.code === "EXIT_CHECK_RATE_LIMITED") {
    const limit: [string, string] = ["Each connection can run a limited number of checks an hour, and that limit has been reached.", "每个连接每小时可运行的核查次数有限，现已达到上限。"];
    const seconds = error.retryAfter;
    if (seconds === undefined) return [`${limit[0]} Wait a little before trying again.`, `${limit[1]}请稍后再试。`];
    if (seconds < 90) return [`${limit[0]} Try again in about ${Math.ceil(seconds)} seconds.`, `${limit[1]}请在约 ${Math.ceil(seconds)} 秒后重试。`];
    const minutes = Math.ceil(seconds / 60);
    return [`${limit[0]} Try again in about ${minutes} minutes.`, `${limit[1]}请在约 ${minutes} 分钟后重试。`];
  }
  switch (error.code) {
    case "EXIT_CHECK_INVALID_TOKEN":
      return ["The token contract was refused. Use a non-zero token contract and a different output asset.", "代币合约被拒绝。请使用非零代币合约，并选择不同的输出资产。"];
    case "EXIT_CHECK_DAILY_BUDGET_EXCEEDED":
      return ["Today's shared chain-data budget has been reached. Try again after the next UTC day begins.", "今日共享链上数据预算已用尽。请在下一个 UTC 日开始后重试。"];
    case "EXIT_CHECK_BUDGET_UNAVAILABLE":
      return ["The chain-data budget guard is unavailable. This check cannot run until it recovers.", "链上数据预算保护暂不可用。恢复后才能运行此核查。"];
    case "EXIT_CHECK_PROVIDER_UNAVAILABLE":
      return ["The chain-data provider is temporarily unavailable. Try again later; no quote was observed.", "链上数据提供商暂不可用。请稍后再试；未观察到报价。"];
    default:
      return ["The request failed, was limited, or returned inconsistent evidence. Check the contract and amount, then retry.", "请求失败、受限或返回了不一致的证据。请检查合约和数量后重试。"];
  }
}
