export const DIRECTORY_CHECKED_AT = "2026-10-12";
export const REVIEW_AFTER_DAYS = 120;
export type Region = "us" | "ca" | "other";
export type DirectoryCopy = readonly [english: string, chinese: string];
export type VenueSource = { label: DirectoryCopy; url: string };
export type VenueAvailability = {
  status: "offered" | "restricted" | "notOffered";
  conditions: DirectoryCopy;
};
export type PerpVenue = {
  name: string;
  url: string;
  product: DirectoryCopy;
  regions: Record<"us" | "ca", VenueAvailability>;
  sources: readonly VenueSource[];
};

/** D23's dated review; no live venue data or inferred eligibility. */
export const PERP_VENUES: readonly PerpVenue[] = [
  {
    name: "Coinbase",
    url: "https://www.coinbase.com/derivatives",
    product: [
      "US-regulated futures, including perpetual-style futures, through Coinbase Financial Markets, a CFTC-registered futures commission merchant and member of the National Futures Association.",
      "通过 Coinbase Financial Markets 提供美国监管的期货，包括永续型期货；该机构是 CFTC 注册的期货佣金商及美国全国期货协会会员。",
    ],
    regions: {
      us: { status: "offered", conditions: [
        "Needs a Coinbase account and derivatives onboarding approved by the venue; derivatives accounts are funded in US dollars.",
        "需要 Coinbase 账户及场所批准的衍生品开户；衍生品账户以美元入金。",
      ] },
      ca: { status: "restricted", conditions: [
        "Only for customers who meet their province's criteria, either net financial assets of at least $5 million excluding real estate, or registration as an investment adviser or dealer; customers attest to eligibility during onboarding; collateral is US dollars.",
        "仅限符合所在省份标准的客户：不含房地产的金融净资产至少为 500 万（场所页面写作“$5 million”），或已注册为投资顾问或交易商；客户在开户时声明符合资格；抵押品为美元。",
      ] },
    },
    sources: [
      { label: ["Coinbase Help: Trading US Derivatives in Canada", "Coinbase 帮助：在加拿大交易美国衍生品"], url: "https://help.coinbase.com/en/coinbase/derivatives/us-derivatives-canada" },
      { label: ["Coinbase Help: US Perpetual-Style Futures market access", "Coinbase 帮助：美国永续型期货市场准入"], url: "https://help.coinbase.com/en/derivatives/perpetual-style-futures/market-access" },
    ],
  },
  {
    name: "Kalshi",
    url: "https://kalshi.com",
    product: [
      "Bitcoin perpetual futures (BTCPERP) on a CFTC-regulated exchange, cleared through Kalshi Klear. The venue states leverage up to 6x and funding every 8 hours.",
      "在 CFTC 监管的交易所提供比特币永续期货（BTCPERP），通过 Kalshi Klear 清算。场所称杠杆最高为 6 倍，每 8 小时结算资金费用。",
    ],
    regions: {
      us: { status: "offered", conditions: ["Described by the venue as for US residents; needs a Kalshi account.", "场所描述为面向美国居民；需要 Kalshi 账户。"] },
      ca: { status: "notOffered", conditions: ["Kalshi describes its perpetual futures as for US residents.", "Kalshi 将其永续期货描述为面向美国居民。"] },
    },
    sources: [
      { label: ["Kalshi Help: What are Perpetual Futures? (24 July 2026)", "Kalshi 帮助：什么是永续期货？（2026 年 7 月 24 日）"], url: "https://help.kalshi.com/en/articles/14679970-what-are-perpetual-futures" },
      { label: ["CFTC release 9240-26 (29 May 2026)", "CFTC 公告 9240-26（2026 年 5 月 29 日）"], url: "https://www.cftc.gov/PressRoom/PressReleases/9240-26" },
    ],
  },
  {
    name: "Kraken",
    url: "https://www.kraken.com",
    product: [
      "CFTC-regulated perpetual futures on Kraken Pro, listed on Bitnomial and offered through Kraken Derivatives US, a CFTC-registered futures commission merchant. The venue states funding every 8 hours.",
      "Kraken Pro 上受 CFTC 监管的永续期货，在 Bitnomial 上市，并通过 CFTC 注册的期货佣金商 Kraken Derivatives US 提供。场所称每 8 小时结算资金费用。",
    ],
    regions: {
      us: { status: "offered", conditions: ["For eligible US clients; needs a verified Kraken account.", "面向符合资格的美国客户；需要已核验的 Kraken 账户。"] },
      ca: { status: "notOffered", conditions: ["Kraken's eligibility page lists Canada as not eligible for its derivatives.", "Kraken 的资格页面将加拿大列为不符合其衍生品资格的地区。"] },
    },
    sources: [
      { label: ["Kraken blog: CFTC-regulated US perps (15 June 2026)", "Kraken 博客：受 CFTC 监管的美国永续期货（2026 年 6 月 15 日）"], url: "https://blog.kraken.com/product/kraken-derivatives/announcing-cftc-regulated-us-perps" },
      { label: ["Kraken Support: Derivatives eligibility (updated 28 July 2026)", "Kraken 支持：衍生品资格（2026 年 7 月 28 日更新）"], url: "https://support.kraken.com/articles/360023786632-kraken-derivatives-eligibility" },
    ],
  },
];

/** An unselected, unsupported or malformed region never implies availability. */
export function venuesForRegion(region: unknown): {
  offered: PerpVenue[]; restricted: PerpVenue[]; notOffered: PerpVenue[];
} {
  const result = { offered: [] as PerpVenue[], restricted: [] as PerpVenue[], notOffered: [] as PerpVenue[] };
  if (region !== "us" && region !== "ca") return result;
  for (const venue of [...PERP_VENUES].sort((a, b) => a.name.localeCompare(b.name, "en")))
    result[venue.regions[region].status].push(venue);
  return result;
}

export function directoryNeedsReview(today: Date): boolean {
  const time = today.getTime();
  return !Number.isFinite(time) || time - Date.parse(`${DIRECTORY_CHECKED_AT}T00:00:00Z`) > REVIEW_AFTER_DAYS * 86_400_000;
}
