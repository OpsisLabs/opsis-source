import { tradeRefusal, type TradeRefusal } from "./trade-refusal";

export type ResearchRefusal = TradeRefusal;
export const researchRefusal = tradeRefusal;

export function researchRefusalCopy(error: ResearchRefusal): [string, string] {
  if (error.status === 429) {
    const limit = ["This connection has reached its hourly limit for lookups.", "此连接已达到每小时查询次数上限。"];
    if (error.retryAfter === undefined) return [limit[0], limit[1]];
    if (error.retryAfter < 90) return [`${limit[0]} Try again in about ${Math.ceil(error.retryAfter)} seconds.`, `${limit[1]}请在约 ${Math.ceil(error.retryAfter)} 秒后重试。`];
    const minutes = Math.ceil(error.retryAfter / 60);
    return [`${limit[0]} Try again in about ${minutes} minutes.`, `${limit[1]}请在约 ${minutes} 分钟后重试。`];
  }
  // The API preserves the provider transport's PROVIDER_* codes, including
  // its monthly, global and per-minute budget refusals.
  if (error.status === 503 && error.code.startsWith("PROVIDER_")) return [
    "Opsis has reached its chain-data rate for the moment. Nothing is wrong with the identifier. Try again in a minute.",
    "Opsis 暂时达到链上数据速率上限。标识符没有问题。请在一分钟后重试。",
  ];
  if (error.status === 400 || error.code === "VALIDATION_ERROR" || error.code === "INVALID_ENTITY") return [
    "The identifier was not accepted. Check that it is a full 0x address or transaction hash.",
    "标识符未被接受。请检查它是否为完整的 0x 地址或交易哈希。",
  ];
  return ["The lookup failed or reached a provider limit. Check the identifier and retry.", "查询失败或达到提供商限制。请检查标识符后重试。"];
}
