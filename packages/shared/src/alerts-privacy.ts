/** Public disclosure shared verbatim by the privacy page and Telegram /privacy. */
export const ALERTS_PRIVACY = {
  en: [
    "Alerts are opt-in. Without an alert, nothing about you is stored, the same as before.",
    "Creating an alert stores the watched public address, the rule and its parameters, an encrypted Telegram chat ID and a keyed digest of it used for lookup, the cooldown, the created and expiry times, and the last firing attempt. Multiplier rules also keep the last observed multiplier, its public block identity and last polling attempt.",
    "A small delivery log stores the public transaction or block identity and what was sent. It holds no chat ID.",
    "Everything is deleted after 30 days, or at once with /alerts stop <id>, /alerts stop all or /alerts delete-my-data. Stopping one ID deletes that rule and its delivery log; stop all and delete-my-data delete all alert data for this chat. Redis expires rules and delivery logs automatically, even while the API is stopped. Deletion does not recall messages already sent to Telegram.",
    "Alert data lives in Opsis's Redis store on our hosting provider; it isn't in any database backup we run. Deleted or expired data may remain in the hosting provider's disk snapshots for a limited period. Alerts can be lost if the store resets; you can re-create them.",
    "Telegram itself is a third party, and its own privacy policy applies to messages: https://telegram.org/privacy.",
    'Alerts are factual notices from a "safe" block about 5–15 minutes behind the chain head. "Safe" is a technical block tag, not a safety verdict. They are not advice, and delivery can be late or missed.',
  ],
  "zh-CN": [
    "提醒由你自愿启用。未创建提醒时，和以前一样，我们不会存储与你有关的信息。",
    "创建提醒会存储所关注的公开地址、规则及其参数、加密的 Telegram 聊天 ID、用于查找的聊天 ID 密钥摘要、冷却时间、创建和到期时间，以及最后一次触发尝试。乘数规则还会保存上次观测的乘数、其公开区块标识和最后一次轮询尝试。",
    "小型发送日志保存公开交易或区块标识及所发送的内容，不含聊天 ID。",
    "所有提醒数据在 30 天后删除，也可立即使用 /alerts stop <id>、/alerts stop all 或 /alerts delete-my-data 删除。停止单个 ID 会删除该规则及其发送日志；stop all 和 delete-my-data 会删除此聊天的全部提醒数据。即使 API 停止运行，Redis 也会自动使规则与发送日志到期。删除不能撤回已发往 Telegram 的消息。",
    "提醒数据存放在托管提供商上 Opsis 的 Redis 存储中，不包含在我们运行的任何数据库备份中。已删除或到期的数据可能在托管提供商的磁盘快照中保留有限时间。存储重置可能导致提醒丢失；你可以重新创建。",
    "Telegram 是第三方，消息适用其自身的隐私政策：https://telegram.org/privacy。",
    "提醒是来自落后链头约 5–15 分钟的“safe”区块的事实通知。“safe”是技术区块标签，不是安全结论。提醒不构成建议，发送可能延迟或遗漏。",
  ],
} as const;
