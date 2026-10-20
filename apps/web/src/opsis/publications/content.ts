type Copy = readonly [string, string];
export type PublicationSection = {
  id: string;
  title: Copy;
  paragraphs: Copy[];
  items?: { title: Copy; body: Copy; href?: string; link?: Copy }[];
};

export const docs: PublicationSection[] = [
  {
    id: "start",
    title: ["Start with a question", "从一个问题开始"],
    paragraphs: [
      [
        "Opsis brings public-chain research, size-specific trade checks, private saved observations and quantitative experiments into one place. Research starts with a public identifier. You do not need to connect a wallet or create an account.",
        "Opsis 集合了公开链上研究、按数量核查交易、私密保存观测以及量化实验。输入公开标识符即可开始研究，无需连接钱包或创建账户。",
      ],
      [
        "Check Data status for this deployment’s enabled tools. An enabled setting does not prove that a provider is responding; each result carries its own time and coverage.",
        "请在数据状态中查看此部署已启用的工具。启用状态并不证明数据提供商正在正常响应；每份结果都有自己的时间和覆盖范围。",
      ],
    ],
    items: [
      {
        title: ["1. Identify", "1. 确认对象"],
        body: [
          "Paste a token or wallet address, or a transaction hash, on Robinhood Chain. Check the exact address and interpreted entity before reading the result.",
          "粘贴 Robinhood Chain 上的代币地址、钱包地址或交易哈希。阅读结果前，核对完整地址及识别的对象类型。",
        ],
      },
      {
        title: ["2. Read the evidence", "2. 阅读证据"],
        body: [
          "Run the check explicitly. Open its sources and limits. Separate an observed fact from a calculation or a hypothetical scenario.",
          "主动运行核查。打开来源与限制，将观测事实、计算结果和假设情景区分开。",
        ],
      },
      {
        title: ["3. Keep the context", "3. 保留背景"],
        body: [
          "Save a supported report in your encrypted local Vault, or choose a follow-up tool. A saved result keeps its original observation time; reopening it does not make it fresh.",
          "将受支持的报告保存到本地加密保险库，或选择后续工具。已保存结果保留原始观测时间，重新打开并不会刷新数据。",
        ],
        href: "/guide",
        link: ["Find your tool →", "选择工具 →"],
      },
    ],
  },
  {
    id: "research",
    title: ["Research an asset or transaction", "研究资产或交易"],
    paragraphs: [
      [
        "Use Research for a token, wallet, contract or transaction. Token identity and metadata, sampled holders, contract controls and decoded movements depend on the sources available for that query. A ticker or self-reported name alone does not establish identity.",
        "使用研究工具查询代币、钱包、合约或交易。代币身份与元数据、持有人样本、合约控制及解码的资金移动取决于本次查询可用的数据源。仅凭代码或自述名称不能确定身份。",
      ],
      [
        "A missing getter or unreadable record is unknown, not evidence that a permission is absent. A transfer is not automatically a trade, and an address does not identify the person behind it. Read any partial-coverage notice before interpreting counts or concentration.",
        "缺失的读取方法或无法读取的记录表示未知，不能证明某项权限不存在。转账并不自动等于交易，地址也不能确认背后的人。解读数量或集中度前，请阅读覆盖不完整的说明。",
      ],
    ],
    items: [
      {
        title: ["Next step", "下一步"],
        body: [
          "Open Research, choose the question and run the lookup. Opening this link sends no lookup by itself.",
          "打开研究，选择问题，然后运行查询。仅打开此链接不会自动查询。",
        ],
        href: "/research",
        link: ["Open Research →", "打开研究 →"],
      },
    ],
  },
  {
    id: "trade",
    title: ["Check an amount", "核查交易数量"],
    paragraphs: [
      [
        "Trade Check estimates the output at the amount you enter, using supported official Uniswap V3 pools on Robinhood Chain. The quote identifies its pool, block, time, included costs and excluded costs. Check the units: an amount denominated in USDG is not automatically a US-dollar value.",
        "交易核查使用 Robinhood Chain 上受支持的官方 Uniswap V3 资金池，估算您输入数量对应的输出。报价注明资金池、区块、时间以及包含和未包含的成本。请核对单位：以 USDG 计价的数量不自动等于美元价值。",
      ],
      [
        "Your submitted identifier and quote amount go to the service and its providers as disclosed before the lookup. Saved Vault quantities are not submitted automatically. Quotes expire and do not prove transferability, sellability or execution. Opsis does not sign or broadcast transactions; an external venue needs a fresh quote and may charge network and trading fees.",
        "提交的标识符与报价数量会按查询前的说明发送至服务及其提供商。保险库中保存的数量不会自动提交。报价有有效期，并不证明资产可转移、可出售或可成交。Opsis 不签名或广播交易；外部场所需要重新报价，并可能收取网络及交易费用。",
      ],
    ],
    items: [
      {
        title: ["Local scenarios", "本地情景"],
        body: [
          "Portfolio shocks and perp cost scenarios calculate hypothetical outcomes from your inputs. They are not forecasts or orders. A liquidation estimate follows its stated simplified assumptions; the venue’s own figure governs.",
          "投资组合冲击与永续成本情景根据您的输入计算假设结果，不是预测或订单。清算估算遵循明确列出的简化假设，以交易场所自身的数值为准。",
        ],
        href: "/check",
        link: ["Open Trade Check →", "打开交易核查 →"],
      },
    ],
  },
  {
    id: "saved",
    title: ["Watch, save and back up", "观察、保存与备份"],
    paragraphs: [
      [
        "Watch stores labels and bounded wallet snapshots in the encrypted local Vault. Refresh a public address explicitly to compare supported observations. Different times and incomplete discovery can limit a comparison; missing data is not a zero balance.",
        "观察工具将标签与有限的钱包快照保存在本地加密保险库。主动刷新公开地址后，可以比较受支持的观测。时间差异与发现范围不完整可能限制比较；数据缺失不等于余额为零。",
      ],
      [
        "Watch does not monitor while your browser is closed. Saved reports and conditions are records, not automatic alerts. Use the tools again when you need a new observation.",
        "浏览器关闭后，观察工具不会持续监控。已保存报告与条件是记录，并非自动提醒。需要新的观测时，请重新使用工具。",
      ],
      [
        "Keep an encrypted export and the matching recovery material somewhere you control. Browser clearing, storage eviction or changing devices can remove local records. A different site origin has separate storage: export from the old origin and import at the new one. Opsis cannot recover a forgotten passphrase or automatically move your Vault.",
        "请在自己控制的位置保留加密导出文件及匹配的恢复材料。清理浏览器、存储清除或更换设备可能导致本地记录丢失。不同网站来源有各自的存储：请从旧来源导出，再在新来源导入。Opsis 无法恢复遗忘的密码，也不会自动搬迁保险库。",
      ],
    ],
    items: [
      {
        title: ["Your records", "您的记录"],
        body: [
          "Use Saved for records, locking, export and import. Private notes and labels stay local.",
          "使用已保存页面查看记录、锁定、导出与导入。私密备注和标签保留在本地。",
        ],
        href: "/saved",
        link: ["Open Saved →", "打开已保存 →"],
      },
    ],
  },
  {
    id: "lab",
    title: ["Run a reproducible experiment", "运行可复现的实验"],
    paragraphs: [
      [
        "Quant Lab separates dated captured views from local experiments. Check a captured dataset’s date before using it as context. For an experiment, review the dataset, units, interval, missing observations and method requirements before running.",
        "量化实验室将有日期的采集视图与本地实验区分开。将采集数据作为背景前，请核对日期。实验运行前，请检查数据集、单位、间隔、缺失观测与方法要求。",
      ],
      [
        "Imported datasets and private portfolio weights stay in the browser. Statistical outputs depend on the supplied sample and assumptions. Keep the run manifest, dataset identity, seed and method with an export so the result can be reproduced. Simulated paths are not price predictions, and insufficient history should stop a method rather than be filled with a different asset.",
        "导入的数据集与私密投资组合权重保留在浏览器中。统计输出取决于样本与假设。导出时请保留运行清单、数据集身份、种子与方法，以便复现结果。模拟路径不是价格预测；历史不足时应停止方法，而不是用其他资产填补。",
      ],
    ],
    items: [
      {
        title: ["Explore data", "探索数据"],
        body: [
          "Choose a view or experiment that matches your question and available data.",
          "选择符合问题及可用数据的视图或实验。",
        ],
        href: "/lab",
        link: ["Open Quant Lab →", "打开量化实验室 →"],
      },
    ],
  },
  {
    id: "evidence",
    title: ["Read the receipt", "阅读证据记录"],
    paragraphs: [
      [
        "Every result has a scope. Look for the source, observation time, block or dataset anchor, units, coverage and limitations. “Observed” describes returned evidence; “derived” describes a calculation; “scenario” describes assumptions you are testing.",
        "每份结果都有范围。请查看来源、观测时间、区块或数据集锚点、单位、覆盖与限制。“观测”表示返回的证据，“推导”表示计算，“情景”表示正在测试的假设。",
      ],
    ],
    items: [
      {
        title: ["Unavailable or refused", "不可用或被拒绝"],
        body: [
          "A provider error, quota or unsupported route can prevent a result. Check the stated reason and try a new check later; do not interpret the error as an empty wallet or absent liquidity.",
          "提供商错误、配额或不受支持的路径可能阻止结果返回。请查看具体原因，稍后重新核查；不要将错误理解为空钱包或没有流动性。",
        ],
      },
      {
        title: ["Stale or partial", "过期或不完整"],
        body: [
          "An older observation is evidence about its own time. A capped sample says nothing about records outside that sample. Refresh explicitly and keep these limits when comparing results.",
          "较早的观测仅说明当时的情况。有上限的样本不说明样本之外的记录。请主动刷新，并在比较时保留这些限制。",
        ],
        href: "/status",
        link: ["Open Data status →", "打开数据状态 →"],
      },
    ],
  },
];

export const whitepaper: PublicationSection[] = [
  {
    id: "abstract",
    title: ["Abstract", "摘要"],
    paragraphs: [
      [
        "A price chart compresses a market into a series. It does not, by itself, explain an asset’s identity, the liquidity available at a particular trade size, the limits of a wallet snapshot or the assumptions behind a simulation. Opsis brings those questions into a common research workflow.",
        "价格图表将市场压缩为序列，但它本身并不能解释资产身份、特定交易数量下的可用流动性、钱包快照的限制或模拟背后的假设。Opsis 将这些问题纳入统一的研究流程。",
      ],
      [
        "The product starts with Robinhood Chain and combines deterministic checks, source-linked evidence and browser-local private context. This paper describes the product’s design and boundaries. Availability is deployment-specific; a planned capability is not a live service.",
        "产品从 Robinhood Chain 开始，结合确定性核查、附有来源的证据及浏览器本地私密背景。本白皮书介绍产品设计与边界。可用性取决于具体部署；计划中的能力并不等于已上线服务。",
      ],
    ],
  },
  {
    id: "workflow",
    title: ["One workflow, four questions", "一个流程，四类问题"],
    paragraphs: [
      [
        "Research asks what an identifier represents and what the available evidence shows. Trade Check asks what output is observed at a chosen size. Watch asks what changed between explicit observations. Quant Lab asks what a dataset and a stated model can support.",
        "研究询问标识符代表什么，以及现有证据表明什么。交易核查询问选定数量对应的观测输出。观察询问主动获取的观测之间发生了什么变化。量化实验室询问数据集与指定模型能够支持什么结论。",
      ],
      [
        "The connection between these tools is a public identity and its evidence, not a recommendation to trade. A saved observation retains its time and limitations. Returning to it should make the next question clearer without implying that the earlier observation is current.",
        "这些工具通过公开身份及证据连接，而不是通过交易建议连接。保存的观测保留时间与限制。再次查看时，它应帮助厘清下一个问题，而不暗示旧观测仍然有效。",
      ],
    ],
  },
  {
    id: "method",
    title: ["Evidence before interpretation", "先有证据，再作解读"],
    paragraphs: [
      [
        "Opsis separates observed values, derived quantities and hypothetical scenarios. An observation is tied to a source, time, chain-qualified identity and bounded coverage. An on-chain check can include a block number and hash; a dataset-based result retains its dataset and method context. Current chain state is not described as final merely because a request succeeded.",
        "Opsis 区分观测值、推导量与假设情景。观测关联来源、时间、带网络限定的身份和有限覆盖范围。链上核查可包含区块号与哈希；基于数据集的结果保留数据集与方法背景。请求成功不代表当前链状态已经最终确认。",
      ],
      [
        "Missing, unavailable, unsupported and observed zero are different states. Comparisons need compatible identities, units, time windows and coverage. A changed input or source must not silently become a claimed market change. Where the evidence cannot support a calculation, the product should explain the refusal.",
        "缺失、不可用、不受支持与观测为零是不同状态。比较需要兼容的身份、单位、时间窗口和覆盖范围。输入或来源变化不能被悄悄描述为市场变化。证据无法支持计算时，产品应解释拒绝的原因。",
      ],
      [
        "Exact integer or fixed-point arithmetic preserves on-chain quantities and monetary units where applicable. Statistical methods use numerical calculations with explicit sample and model assumptions. Neither path turns an estimate into guaranteed execution or a forecast.",
        "在适用场景中，精确整数或定点运算保留链上数量和货币单位。统计方法进行数值计算，并明确样本与模型假设。这两种方式都不会让估算变成保证成交或预测。",
      ],
    ],
  },
  {
    id: "architecture",
    title: ["Public reads, local context", "公开读取，本地背景"],
    paragraphs: [
      [
        "The browser presents research and runs local scenarios. A read-only API coordinates bounded public-data requests through admitted providers. Source adapters normalize results while preserving provenance and limitations. Budgets and request caps can stop a lookup; a quota refusal must remain visible rather than produce a fabricated result.",
        "浏览器展示研究并运行本地情景。只读 API 通过已准入的提供商协调有限的公开数据请求。数据源适配器在规范化结果的同时保留来源与限制。预算和请求上限可能停止查询；配额拒绝应明确显示，而不是生成虚构结果。",
      ],
      [
        "Production Robinhood Chain RPC reads use dRPC under a prepaid provider balance and an application compute-unit limit. Explorer-backed fields can use Blockscout within its configured limits. A successful explorer token lookup does not establish RPC health. Provider failures may affect different fields and tools differently.",
        "生产环境的 Robinhood Chain RPC 读取使用 dRPC，受提供商预付余额与应用计算单元上限约束。由区块浏览器提供的字段可在配置限制内使用 Blockscout。浏览器代币查询成功并不能证明 RPC 正常。提供商故障对不同字段与工具的影响可能不同。",
      ],
      [
        "Captured datasets are labeled with their capture date. Local experiments retain method, input and seed context. Additional public-history capture, explanation providers and chain adapters require their own verification before being enabled; code preparation alone does not establish live coverage.",
        "采集数据集注明采集日期。本地实验保留方法、输入和种子背景。新增公开历史采集、解释服务和网络适配器在启用前需要各自验证；仅完成代码准备不能证明已经有实时覆盖。",
      ],
    ],
  },
  {
    id: "privacy",
    title: ["A deliberate privacy boundary", "明确的隐私边界"],
    paragraphs: [
      [
        "Private labels, notes, purchase context and saved records belong in the encrypted browser-local Vault. Imported datasets and private weights stay in local analysis. These records are not sent to an AI model. Research does not require a connected wallet or an Opsis account.",
        "私密标签、备注、购买背景与保存记录存放在浏览器本地加密保险库中。导入的数据集与私密权重用于本地分析。这些记录不会发送给 AI 模型。研究不需要连接钱包或创建 Opsis 账户。",
      ],
      [
        "Public lookups are a separate boundary: the identifier and, for a quote, the explicitly submitted amount are disclosed to the service and relevant providers. Browser-local storage is not a claim that public requests are anonymous to infrastructure operators. The product explains this boundary before a lookup.",
        "公开查询属于另一条边界：标识符以及报价时主动提交的数量会发送给服务及相关提供商。浏览器本地存储并不表示公开请求对基础设施运营方匿名。产品在查询前说明这一边界。",
      ],
      [
        "Local ownership also creates a recovery responsibility. Users need an encrypted backup and matching recovery material. Storage loss, browser clearing and origin changes can make records inaccessible. The service cannot restore a lost passphrase.",
        "本地控制也带来恢复责任。用户需要加密备份及匹配的恢复材料。存储丢失、清理浏览器和网站来源变更可能导致记录无法访问。服务无法恢复丢失的密码。",
      ],
    ],
  },
  {
    id: "limits",
    title: ["What the system does not establish", "系统不能证明什么"],
    paragraphs: [
      [
        "A contract check is bounded evidence, not an audit or safety verdict. A sampled holder list is not a complete ownership map. A quote is not a guarantee that a token can be transferred or sold. A historical association is not proof of cause. A simulation describes outcomes under assumptions, not future returns.",
        "合约核查是有限证据，不是审计或安全判定。持有人样本不是完整的所有权图谱。报价不保证代币可以转移或出售。历史关联不能证明因果。模拟描述假设下的结果，而非未来收益。",
      ],
      [
        "Opsis does not hold private keys, sign or broadcast transactions. External tools own execution and require their own current checks, eligibility and user-paid costs. Local perp scenarios do not place orders. In-app perp execution remains planned and unavailable.",
        "Opsis 不持有私钥，不签名或广播交易。外部工具负责执行，需要进行自己的最新核查、资格判断，并产生由用户承担的费用。本地永续情景不会下单。应用内永续交易仍属计划，当前不可用。",
      ],
      [
        "This paper makes no token utility, access, governance, revenue or price claim. The CA field shows the Opsis token's contract address on Robinhood Chain so you can check it exactly. Opsis provides information and research tools, not personalized investment advice.",
        "本白皮书不作代币用途、准入、治理、收入或价格声明。CA 栏显示 Opsis 代币在 Robinhood Chain 上的合约地址，便于您准确核对。Opsis 提供信息与研究工具，不提供个性化投资建议。",
      ],
    ],
  },
  {
    id: "development",
    title: ["Development direction", "开发方向"],
    paragraphs: [
      [
        "Planned work includes bounded public history and exports, evidence-bound explanations, additional EVM-chain research and comparisons of explicitly saved checks. Each depends on appropriate data rights, coverage, privacy and release verification. These are directions for development, with no release dates promised here.",
        "计划中的工作包括有限的公开历史与导出、基于证据的解释、更多 EVM 网络研究，以及主动保存的核查之间的比较。每项都需要适当的数据使用权、覆盖范围、隐私保障及发布验证。它们是开发方向，本页不承诺发布日期。",
      ],
      [
        "The standard for an update is a useful question answered with visible limits. The live tool’s source, date, coverage and availability take precedence over a roadmap description. Read the documentation for the practical workflow and Data status for this deployment’s configuration.",
        "更新的标准是回答一个有用的问题，并明确其限制。实际工具中的来源、日期、覆盖与可用性优先于路线图描述。实际操作流程请查阅文档，此部署的配置请查看数据状态。",
      ],
    ],
    items: [
      {
        title: ["Read alongside this paper", "配套阅读"],
        body: [
          "Docs explains the user workflow. Privacy and Terms describe the published service boundaries. Data status describes configuration, not a live provider-health guarantee.",
          "文档说明用户操作流程。隐私与条款介绍已公布的服务边界。数据状态说明配置，而不是对提供商实时健康状况的保证。",
        ],
        href: "/docs",
        link: ["Read the docs →", "阅读文档 →"],
      },
    ],
  },
];
