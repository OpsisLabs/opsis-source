// The host owns the locale. Both languages stay bundled; no request or URL is needed.
let locale='en';
const translations=new Map([
 ['Docs','文档'],['Whitepaper','白皮书'],['Docs ↗','文档 ↗'],['Whitepaper ↗','白皮书 ↗'],
 ['Get quant-level insight into Robinhood Chain with Opsis. Compare tokens, explore trading activity, and try out portfolio scenarios.','通过 Opsis 深入了解 Robinhood Chain。比较代币、探索交易活动，并尝试投资组合情景。'],
 ['Opsis — Robinhood Chain, made clearer.','Opsis — 更清晰地了解 Robinhood Chain。'],
 ['Skip to tools','跳转到工具'],['Opsis home','Opsis 首页'],['Open navigation','打开导航'],['Close navigation','关闭导航'],['Main navigation','主导航'],
 ['Overview','概览'],['The scan','扫描'],['Saved','已保存'],['Saved ↗','已保存 ↗'],['Find your tool','选择工具'],['Find your tool ↗','选择工具 ↗'],['LOCK PREVIEW','锁定预览'],
 ['MOTION / ON','动态 / 开启'],['MOTION / OFF','动态 / 关闭'],['MAKE SENSE OF THE CHAIN.','理解链上的信息。'],['Workspaces','工作区'],
 ['Research','研究'],['Trade Check','交易核查'],['Watch','观察'],['Stock-token check','股票代币核查'],['Quant Lab','量化实验室'],['Quant Lab ↗','量化实验室 ↗'],['World & markets','世界与市场'],
 ['Interactive blockchain sculpture','互动区块链雕塑'],['Six interlocking sculpted three-dimensional chain links rendered as a point cloud. Scroll to scan the chain and open its intelligence tools.','六个相互连接的三维链环，以点云呈现。滚动扫描链条并打开分析工具。'],['Original interlocking chain links rendered in white surface points','原始相互连接的链环，以白色表面点呈现'],
 ['See the bigger','看到更完整的'],['picture.','图景。'],['Research a token. Check trading costs. Follow a wallet. Explore market data.','研究代币。核查交易成本。关注钱包。探索市场数据。'],['No wallet. No sign-up.','无需钱包。无需注册。'],
 ['EXPLORE THE CHAIN','探索链条'],['It’s all connected.','一切相互连接。'],['Markets, wallets, and world events. Keep scrolling to explore the connections.','市场、钱包与世界事件。继续滚动，探索它们之间的联系。'],['CHOOSE A TOOL','选择工具'],['Start with a question.','从一个问题开始。'],['Pick a question, then choose the tool that answers it. New here? Use Find your tool.','先选择问题，再选择回答它的工具。初次使用？试试选择工具。'],['Blockchain tools','区块链工具'],
 ['Opsis / CHAIN 001','Opsis / 链条 001'],['EACH RING OPENS A TOOL','每个链环打开一个工具'],['LOADING POINT CLOUD_','正在加载点云_'],['Scan','扫描'],['Choose a tool','选择工具'],['Scroll to explore the chain ↓','滚动探索链条 ↓'],['Choose a tool above','选择上方的工具'],['Ambient news: Off','背景新闻：关闭'],['Ambient news: On','背景新闻：开启'],
 ['Go beyond the demo','从演示走向研究'],['An asset in mind?','想研究某个资产？'],['Paste a token, wallet, or transaction on Robinhood Chain. Open Research, choose your question, and run a source-linked check.','粘贴 Robinhood Chain 上的代币、钱包或交易。打开研究，选择问题，并运行附有来源的核查。'],['Public address or transaction hash','公开地址或交易哈希'],['Run a check ↗','运行核查 ↗'],['Robinhood Chain · No automatic lookup · No wallet needed','Robinhood Chain · 不自动查询 · 无需钱包'],
 ['Six ways to look closer.','六种深入了解的方式。'],['Choose a tool. Find your next question.','选择工具。找到下一个问题。'],['A different view','用不同视角'],['of the market.','看市场。'],['See where trading happens.','看看交易发生在哪里。'],['Compare tokens. Test your thinking.','比较代币。检验想法。'],['Open Quant Lab','打开量化实验室'],['Open the Quant Lab shown in this preview','打开此预览中的量化实验室'],['Actual Quant Lab: a three-dimensional market map of trading pools, with analysis alongside it.','实际的量化实验室：三维交易资金池图谱及分析。'],['Explore this view','探索此视图'],['Preview Quant Lab views','预览量化实验室视图'],['Pool atlas','资金池图谱'],['Compare tokens','比较代币'],['Portfolio surface','投资组合曲面'],['Saved data · 10 Sep 2026','已保存数据 · 2026 年 9 月 10 日'],['tokens to compare','个可比较的代币'],['trading pools to explore','个可探索的交易资金池'],['One place to see','在同一处了解'],['how the market fits together.','市场如何相互联系。'],
 ['Open the interactive World & markets','打开互动世界与市场'],['The actual World & markets’s point-cloud globe with selectable news locations.','世界与市场中的点云地球，可选择新闻地点。'],['A world','世界中的'],['of context.','背景信息。'],['Connect the headlines to the markets. Find a report on the globe, read its source, and see what prices did around it.','把新闻与市场联系起来。在地球上找到报道，阅读来源，并查看发布前后的价格变化。'],['Explore World & markets','探索世界与市场'],['Dated reports · Source-linked observations','有日期的报道 · 附有来源的观测'],
 ['Follow your next question.','追寻下一个问题。'],['Connected research tools.','相互连接的研究工具。'],['A hands-on way to understand the details.','动手了解细节。'],['Try Research','打开研究'],['Where did it go?','它去了哪里？'],['Follow wallet activity and the connections between transfers.','查看钱包活动与转账之间的联系。'],['Open Research','打开研究'],['Open Watch','打开观察'],['What changed?','发生了什么变化？'],['Check a public wallet and compare saved observations.','核查公开钱包并比较已保存的观测。'],['Try Trade Check','打开交易核查'],['What does exiting cost?','退出需要多少成本？'],['Check how the amount, fees, and available liquidity affect an exit estimate.','核查数量、费用和可用流动性如何影响退出估算。'],['Open Trade Check','打开交易核查'],['Try Stock-token check','打开股票代币核查'],['What’s behind the token?','代币背后是什么？'],['Look at identity, custody, reserves, and redemption evidence.','查看身份、托管、储备与赎回证据。'],['Open Stock-token check','打开股票代币核查'],['Research and trade checks use the existing Opsis engines. Availability and coverage are shown in each tool. No transaction execution.','研究与交易核查使用现有的 Opsis 引擎。每个工具展示可用性与覆盖范围。不执行交易。'],
 ['Why Opsis','为何选择 Opsis'],['More perspective.','更多视角。'],['Less guesswork.','更少猜测。'],['Crypto gives you plenty of numbers. We bring markets, wallet activity, and world events into one visual place, so you can see the connections and decide what to investigate next.','加密市场提供大量数字。我们把市场、钱包活动和世界事件集中呈现，让你看见联系，并决定接下来研究什么。'],
 ['The latest reports','最新报道'],['Stay curious.','保持好奇。'],['The stories moving crypto. Search a topic, choose a source, and read the original report.','与加密市场相关的报道。搜索主题，选择来源，阅读原始报道。'],['Live headlines are not connected in this preview.','此预览未连接实时新闻。'],['Open the news source ↗','打开新闻来源 ↗'],['Live headlines are unavailable. Open Research for source-linked checks.','实时新闻不可用。打开研究，进行附有来源的核查。'],
 ['About the data','关于数据'],['Clear about','清楚说明'],['what’s here.','这里的内容。'],['A date on the data.','数据带有日期。'],['Quant Lab and World & markets use dated observations. Quant Lab was captured on 10 September 2026. Sources are available inside each tool.','量化实验室与世界与市场使用有日期的观测。量化实验室数据采集于 2026 年 9 月 10 日。每个工具内均提供来源。'],['Evidence, clearly marked.','清楚标注证据。'],['Research, Trade Check, Watch, and Saved connect to the existing engines. Scenarios explore your assumptions; they don’t predict prices or place trades.','研究、交易核查、观察与已保存连接现有引擎。情景用于探索假设，不预测价格或执行交易。'],
 ['Connect the dots.','连接线索。'],['No wallet. No sign-up. Just explore.','无需钱包。无需注册。开始探索。'],['Robinhood Chain,','Robinhood Chain，'],['made clearer.','更清晰。'],['Explore OPSIS tools','探索 Opsis 工具'],['About OPSIS','关于 Opsis'],['About Opsis','关于 Opsis'],['Headlines','新闻'],['Motion: On','动态：开启'],['Motion: Off','动态：关闭'],['OPSIS squared','Opsis 的平方'],['© 2026 Opsis · A research preview. Not investment advice.','© 2026 Opsis · 研究预览。不构成投资建议。'],['Back to top ↑','返回顶部 ↑'],['JavaScript is required for the interactive terminal and blockchain animation.','互动工具与区块链动画需要 JavaScript。'],
 ['// OVERVIEW','// 概览'],['// CHAIN ANALYSIS','// 链条分析'],['// INTELLIGENCE MODULES','// 分析工具'],['CHAIN 001 / READY','链条 001 / 已就绪'],['STATIC VIEW / TOOLS BELOW','静态视图 / 工具在下方']
]);
export function c(en,zh){translations.set(en,zh);return locale==='zh-CN'?zh:en}
export function t(value){
 if(locale==='zh-CN')return translations.get(value)??value;
 for(const [en,zh] of translations)if(zh===value)return en;
 return value;
}
const textSources=new WeakMap(),attributeSources=new WeakMap();
function translated(current,previous){
 const original=previous?.rendered===current?previous.original:(translations.has(current)?current:[...translations].find(([,zh])=>zh===current)?.[0]??current);
 return {original,rendered:t(original)};
}
export function localize(){
 document.documentElement.lang=locale;
 const walker=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){
  const node=walker.currentNode;
  if(['SCRIPT','STYLE'].includes(node.parentElement?.tagName))continue;
  const trimmed=node.textContent.trim();
  const source=translated(trimmed,textSources.get(node));textSources.set(node,source);
  node.textContent=node.textContent.replace(trimmed,source.rendered);
 }
 document.querySelectorAll('[aria-label],[alt],title,meta[name="description"]').forEach(el=>{
  const sources=attributeSources.get(el)??{};attributeSources.set(el,sources);
  for(const attr of ['aria-label','alt','content'])if(el.hasAttribute(attr)){sources[attr]=translated(el.getAttribute(attr),sources[attr]);el.setAttribute(attr,sources[attr].rendered);}
 });
}
document.addEventListener('opsis:locale',event=>{locale=event.detail?.locale==='zh-CN'?'zh-CN':'en';localize()});
