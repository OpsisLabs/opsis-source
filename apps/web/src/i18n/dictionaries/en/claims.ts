export const claims = {
  "claims.title": "Claim Check",
  "claims.intro":
    "Compare token claims with chain evidence at stated blocks. Not investment advice.",
  "claims.privacy":
    "Text stays in this browser. Handles and URLs are removed before pattern matching. Only confirmed address, typed claims and post time are sent.",
  "claims.paste": "Post text",
  "claims.find": "Find claims",
  "claims.pattern": "found by pattern",
  "claims.manual": "Added by type",
  "claims.add": "Add claim",
  "claims.remove": "Remove",
  "claims.type": "Claim type",
  "claims.address": "Contract address",
  "claims.reminder":
    "Lookalike tickers are common. Confirm the exact contract address before running a check.",
  "claims.confirm": "Confirm this contract address",
  "claims.confirmed": "Address confirmed",
  "claims.time": "Post time (optional, local time)",
  "claims.run": "Run claim check",
  "claims.busy": "Checking…",
  "claims.error":
    "Check unavailable. Review the address, parameters and budgets, then retry.",
  "claims.expected": "Claimed state",
  "claims.yes": "Present",
  "claims.no": "Absent",
  "claims.percent": "Percent",
  "claims.comparison": "Comparison",
  "claims.under": "Under",
  "claims.over": "Over",
  "claims.equal": "Exactly",
  "claims.buy": "Buy tax %",
  "claims.sell": "Sell tax %",
  "claims.current": "current, not final",
  "claims.post": "post time",
  "claims.unknownBlock": "Block unavailable",
  "claims.agrees": "agrees",
  "claims.differs": "differs",
  "claims.can't check": "can't check",
  "claims.ownership": "Ownership renounced",
  "claims.paused": "Contract paused / not paused",
  "claims.lpBurned": "LP burned",
  "claims.top10": "Top 10 holders share",
  "claims.deployer": "Deployer share",
  "claims.launchpad": "Launchpad",
  "claims.verified": "Contract source verified",
  "claims.tax": "Buy/sell tax",
  "claims.unsupported": "Other claim",
  "claims.launcher":
    "Uniswap Liquidity Launcher (includes pools.trade and other front ends)",
  "claims.reason": "Reason",
  "claims.definition": "Definition",
  "claims.evidence": "Evidence",
  "claims.definition.ownership":
    "Ownership renounced means owner() reads as the zero address AND the ERC-1967 admin slot is zero. If either read is unavailable, can't check.",
  "claims.definition.paused":
    "Contract paused / not paused means the standard paused() read reports the claimed state. If the read is unavailable, can't check.",
  "claims.definition.lpBurned":
    "LP burned means every LP position Opsis launch facts can see for this token is held by the zero address or 0x000000000000000000000000000000000000dEaD. Unknown or partial LP recipient coverage gives can't check. A recorded initial recipient alone does not establish current holdings.",
  "claims.definition.top10":
    "Top 10 holders hold under / over / exactly X% means the explorer-reported top 10 share satisfies the stated strict comparison or exact equality. Pools and burn addresses are counted as the explorer reports them. The explorer is current-only; historical or missing evidence gives can't check.",
  "claims.definition.deployer":
    "Deployer holds under / over / exactly X% means balanceOf(deployer) / totalSupply at the stated block satisfies the stated strict comparison or exact equality. The deployer comes from Opsis launch facts. Missing launch facts, balance or positive total supply gives can't check.",
  "claims.definition.launchpad":
    "Launched on a launchpad means Opsis launch facts match that registry adapter. Uniswap Liquidity Launcher covers pools.trade and other front ends; a match does not identify a front end. Missing registry evidence gives can't check.",
  "claims.definition.verified":
    "Contract source verified means the explorer verification flag reports the claimed state. The explorer is current-only; historical or unavailable explorer evidence gives can't check.",
  "claims.definition.tax":
    "Buy/sell tax X% / no tax can't be checked in this version.",
  "claims.definition.unsupported":
    "A claim type outside the published list can't be checked in this version.",
  "claims.detail.Source evidence unavailable at the stated block":
    "Source evidence unavailable at the stated block",
  "claims.detail.Evidence unavailable": "Evidence unavailable",
  "claims.detail.Owner or ERC-1967 admin read unavailable":
    "Owner or ERC-1967 admin read unavailable",
  "claims.detail.Pause read unavailable": "Pause read unavailable",
  "claims.detail.LP recipients unavailable": "LP recipients unavailable",
  "claims.detail.Supply share unavailable or invalid":
    "Supply share unavailable or invalid",
  "claims.detail.Tax claims can't be checked in this version":
    "Tax claims can't be checked in this version",
  "claims.detail.Claim type outside the published list":
    "Claim type outside the published list",
  "claims.detail.Post time is after the captured current block":
    "Post time is after the captured current block",
  "claims.detail.Post time precedes the first available block":
    "Post time precedes the first available block",
  "claims.detail.Launch registry match is missing":
    "Launch registry match is missing",
  "claims.detail.LP recipient coverage is unknown or partial, or only an initial non-burn recipient is available":
    "LP recipient coverage is unknown or partial, or only an initial non-burn recipient is available",
  "claims.detail.Launch facts do not identify a deployer":
    "Launch facts do not identify a deployer",
  "claims.detail.Explorer evidence is current-only and cannot be read at the post-time block":
    "Explorer evidence is current-only and cannot be read at the post-time block",
  "claims.detail.Explorer holder share unavailable":
    "Explorer holder share unavailable",
  "claims.detail.Explorer verification flag unavailable":
    "Explorer verification flag unavailable",
  "claims.detail.Explorer current sample; not block-pinned. Pools and burn addresses included as reported.":
    "Explorer current sample; not block-pinned. Pools and burn addresses included as reported.",
  "claims.detail.Launch facts recorded the burn recipient; other position transfers are not indexed":
    "Launch facts recorded the burn recipient; other position transfers are not indexed",
  "claims.detail.paused": "paused",
  "claims.detail.not paused": "not paused",
  "claims.detail.verified": "verified",
  "claims.detail.not verified": "not verified",
  "claims.detail.Robinhood Chain RPC": "Robinhood Chain RPC",
  "claims.evidenceKey.source": "source",
  "claims.evidenceKey.coverage": "coverage",
  "claims.evidenceKey.block": "block",
  "claims.evidenceKey.timestamp": "timestamp",
  "claims.evidenceKey.owner": "owner",
  "claims.evidenceKey.admin": "admin",
  "claims.evidenceKey.paused": "paused",
  "claims.evidenceKey.numerator": "numerator",
  "claims.evidenceKey.denominator": "denominator",
  "claims.evidenceKey.adapter": "adapter",
  "claims.evidenceKey.recipients": "recipients",
  "claims.evidenceKey.method": "method",
  "claims.evidenceKey.observedAt": "observedAt",
  "claims.evidenceKey.deployer": "deployer",
  "claims.evidenceKey.verified": "verified",
} as const;
