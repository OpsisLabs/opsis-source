"use strict";
const $ = (id) => document.getElementById(id),
  $$ = (s) => [...document.querySelectorAll(s)],
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const usd = (n, d = 2) =>
    Number.isFinite(n)
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: d,
          maximumFractionDigits: d,
        }).format(n)
      : "Unavailable",
  compact = (n) =>
    Number.isFinite(n)
      ? n >= 1e9
        ? "$" + (n / 1e9).toFixed(2) + "B"
        : n >= 1e6
          ? "$" + (n / 1e6).toFixed(2) + "M"
          : n >= 1e3
            ? "$" + (n / 1e3).toFixed(1) + "K"
            : usd(n)
      : "—",
  price = (n) => usd(n, n < 1 ? 4 : 2),
  pct = (n) =>
    Number.isFinite(n)
      ? (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(2) + "%"
      : "—";
const state = {
  tokens: [],
  pools: [],
  mode: "atlas",
  filter: "all",
  min: 10000,
  selected: "weth",
  compare: new Set(["weth", "pons", "cashcat"]),
  all: false,
  core: -12,
  other: -30,
  weight: 40,
  fee: 0.3,
  yaw: -0.48,
  pitch: 0.38,
  zoom: 1,
  rotating: !matchMedia("(prefers-reduced-motion:reduce)").matches,
  mesh: false,
};
let source,
  canvas = $("space"),
  ctx = canvas.getContext("2d"),
  w = 900,
  h = 395,
  fitS = 120,
  fitX = 450,
  fitY = 220,
  projected = [],
  drag,
  hover,
  last = 0,
  run = 0;
const token = (id) => state.tokens.find((t) => t.id === id),
  eligible = () =>
    state.pools.filter(
      (p) =>
        (state.filter === "all" || p.tokenId === state.filter) &&
        p.liquidity.usd >= state.min &&
        p.volume?.h24 >= 1000 &&
        Number.isFinite(p.priceChange?.h24),
    );
const weights = () => ({
  weth: state.weight,
  cbbtc: 15,
  pons: 20,
  cashcat: 10,
  usdg: 55 - state.weight,
});
function scenario(core = state.core, other = state.other) {
  const a = weights(),
    coreWeight = (a.weth + a.cbbtc) / 100,
    otherWeight = (a.pons + a.cashcat) / 100;
  const gross =
      10000 * (1 + (coreWeight * core) / 100 + (otherWeight * other) / 100),
    net = gross * (1 - state.fee / 100);
  return { gross, net, pl: net - 10000 };
}
function notify(s) {
  $("toast").textContent = s;
  $("toast").hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => ($("toast").hidden = true), 1900);
}
function explain(label, title, paragraphs, evidence, animate = false) {
  const id = ++run;
  $("analysisLabel").textContent = label;
  $("analysisTitle").innerHTML = title;
  $("analysisEvidence").innerHTML = evidence
    .map((x) => `<span>${esc(x)}</span>`)
    .join("");
  const html = paragraphs.map((p) => `<p>${p}</p>`).join("");
  if (!animate) {
    $("analysisText").innerHTML = html;
    return;
  }
  const plain = paragraphs.map((p) => p.replace(/<[^>]*>/g, "")).join(" ");
  let n = 0;
  const tick = () => {
    if (id !== run) return;
    n += 8;
    $("analysisText").textContent = plain.slice(0, n);
    if (n < plain.length) setTimeout(tick, 12);
    else $("analysisText").innerHTML = html;
  };
  tick();
}
function marketRead(animate = false) {
  const a = state.tokens,
    deep = [...a].sort((a, b) => b.liquidity - a.liquidity)[0],
    mover = [...a].sort(
      (a, b) => (b.returns.h24 ?? -Infinity) - (a.returns.h24 ?? -Infinity),
    )[0];
  explain(
    "ONCHAIN MARKET READ",
    "Activity is a signal.<br>Context is the edge.",
    [
      `<strong>${deep.symbol}</strong> has the largest observed primary-pool liquidity here: <strong>${compact(deep.liquidity)}</strong>.`,
      `${mover.symbol} is up ${pct(mover.returns.h24)} over 24h in its primary pool. A large move does not establish durable demand or an attractive entry.`,
    ],
    [`${state.pools.length} pools observed`, "Chain 4663"],
    animate,
  );
}
function scenarioRead(animate = false) {
  const r = scenario();
  explain(
    "TWO-FACTOR STRESS TEST",
    "Separate the shocks.<br>See the exposure.",
    [
      `<strong>${state.core}% WETH + cbBTC</strong>, <strong>${state.other}% other crypto</strong>, with ${state.fee.toFixed(2)}% selling costs: <strong>${r.pl < 0 ? "−" : "+"}${usd(Math.abs(r.pl))}</strong> on $10,000.`,
      `USDG is held at its captured price as an assumption. These 2,501 combinations carry no probabilities or price forecast.`,
    ],
    [`${state.weight + 15}% WETH + cbBTC`, "30% PONS + CASHCAT"],
    animate,
  );
}
function focused() {
  const t = token(state.selected);
  if (!t) return;
  $("focusedAsset").innerHTML =
    `<span class="overline">IN FOCUS / ROBINHOOD CHAIN</span><button data-focused="${t.id}"><img src="${t.icon}" alt="${t.symbol}"><span><small style="color:${t.color}">${esc(t.name)}</small><b>${esc(t.symbol)}</b><strong>${price(t.price)} <em class="${t.returns.h24 < 0 ? "negative" : "positive"}">${pct(t.returns.h24)}</em></strong></span></button><div class="focused-metric">PRIMARY POOL LIQUIDITY <b>${compact(t.liquidity)}</b></div><div class="focused-metric">24H CHAIN VOLUME <b>${t.reportedChainVolumeDisplay}</b></div>`;
}
function mode(m) {
  state.mode = m;
  state.yaw = m === "atlas" ? -0.48 : -0.56;
  state.pitch = m === "atlas" ? 0.38 : 0.57;
  state.zoom = 1;
  hover = null;
  $("chartTooltip").hidden = true;
  for (const [id, name] of [
    ["atlasTab", "atlas"],
    ["scenarioTab", "scenario"],
  ]) {
    $(id).classList.toggle("active", m === name);
    $(id).setAttribute("aria-selected", m === name);
  }
  $("railAtlas").classList.toggle("active", m === "atlas");
  $("railStress").classList.toggle("active", m === "scenario");
  $("poolControls").hidden = m !== "atlas";
  $("inlineControls").hidden = m !== "scenario";
  $("meshToggle").disabled = m === "atlas";
  $("boardLabel").textContent =
    m === "atlas"
      ? "EXACT-CONTRACT POOLS / ROBINHOOD CHAIN"
      : "$10,000 PORTFOLIO / 2,501 JOINT SCENARIOS";
  $("boardTitle").textContent =
    m === "atlas"
      ? "Momentum meets liquidity."
      : "Turn assumptions into exposure.";
  $("axisLegend").innerHTML =
    m === "atlas"
      ? "<span><b>X</b> Pool volume 24h · log USD</span><span><b>Y</b> Price change 24h · symlog %</span><span><b>Z</b> Pool liquidity · log USD</span>"
      : "<span><b>X</b> WETH + cbBTC move · −40% to +40%</span><span><b>Y</b> Portfolio P/L · USD</span><span><b>Z</b> Other crypto move · −60% to +60%</span>";
  $("visibleCount").textContent =
    m === "atlas"
      ? `${eligible().length} / ${state.pools.length} pools plotted`
      : "61 × 41 shock pairs";
  $("cloudCount").textContent =
    m === "atlas" ? "EACH POINT = A REAL POOL" : "USER-SET SCENARIOS";
  focused();
  m === "atlas" ? marketRead() : scenarioRead(true);
}
function renderStrip() {
  $("tokenStrip").innerHTML =
    `<button data-filter="all" class="${state.filter === "all" ? "active" : ""}">◈ All crypto</button>` +
    state.tokens
      .map(
        (t) =>
          `<button data-filter="${t.id}" class="${state.filter === t.id ? "active" : ""}"><img src="${t.icon}" alt="">${esc(t.symbol)}</button>`,
      )
      .join("");
}
function renderTable() {
  const preferred = ["weth", "cbbtc", "pons", "cashcat", "usdg", "juggernaut"];
  const a = state.all ? state.tokens : preferred.map(token);
  $("assetRows").innerHTML = a
    .map(
      (t) =>
        `<tr data-token="${t.id}"><td><button class="asset-cell" data-inspect="${t.id}"><span class="rank">${String(state.tokens.indexOf(t) + 1).padStart(2, "0")}</span><img src="${t.icon}" alt="${t.symbol}"><span><b>${esc(t.symbol)}</b><small>${t.contract.slice(0, 6)}…${t.contract.slice(-4)}</small></span></button></td><td>${price(t.price)}</td><td class="${t.returns.h24 < 0 ? "negative" : "positive"}">${pct(t.returns.h24)}</td><td>${t.reportedChainVolumeDisplay}</td><td>${compact(t.liquidity)}</td><td><button class="add-button" data-compare="${t.id}" aria-pressed="${state.compare.has(t.id)}" aria-label="${state.compare.has(t.id) ? "Remove" : "Compare"} ${t.symbol}">${state.compare.has(t.id) ? "✓" : "+"}</button></td></tr>`,
    )
    .join("");
  $("compareCount").textContent = state.compare.size;
  $("navCount").textContent = state.compare.size;
  $("showAll").textContent = state.all
    ? "Show featured tokens ↑"
    : "Show all 10 ↓";
}
function heatCell(v) {
  const p = Number.isFinite(v),
    positive = v >= 0,
    alpha = p ? Math.min(0.65, 0.11 + Math.abs(v) / 150) : 0.08;
  return `<div class="heat-cell" style="background:${p ? (positive ? "rgba(108,168,58," : "rgba(201,78,75,") + alpha + ")" : "#22323a"};color:${p ? (positive ? "#d5f7b1" : "#ffb29e") : "#69838f"};--strength:${p ? Math.min(100, Math.abs(v)) + "%" : "0%"}">${pct(v)}</div>`;
}
function renderHeat() {
  $("heatmap").innerHTML =
    "<span>TOKEN</span><span>5 MINUTES</span><span>1 HOUR</span><span>6 HOURS</span><span>24 HOURS</span>" +
    ["weth", "cbbtc", "pons", "cashcat", "juggernaut", "dogo", "sushi", "usdg"]
      .map((id) => {
        const t = token(id);
        return (
          `<div class="heat-token"><img src="${t.icon}" alt="">${t.symbol}</div>` +
          ["m5", "h1", "h6", "h24"].map((k) => heatCell(t.returns[k])).join("")
        );
      })
      .join("");
}
function portfolio() {
  const a = weights();
  $("concentration").innerHTML = Object.entries(a)
    .filter(([, v]) => v > 0)
    .map(
      ([id, v]) =>
        `<span style="flex:${v};background:${token(id).color}"></span>`,
    )
    .join("");
  $("allocations").innerHTML = Object.entries(a)
    .map(([id, v]) => {
      const t = token(id);
      return `<div class="allocation"><img src="${t.icon}" alt=""><span>${t.symbol}</span><small>${((100 * v) / t.price).toFixed(t.price > 100 ? 4 : 1)} tokens</small><b>${v}%</b></div>`;
    })
    .join("");
  $("weightValue").textContent = state.weight + "%";
  $("feeValue").textContent = state.fee.toFixed(2) + "%";
  const r = scenario();
  $("scenarioPL").textContent = (r.pl < 0 ? "−" : "+") + usd(Math.abs(r.pl));
  $("scenarioPL").className = r.pl < 0 ? "negative" : "positive";
  $("scenarioNet").textContent = usd(r.net);
  $("coreValue").textContent = pct(state.core);
  $("otherValue").textContent = pct(state.other);
  $("inlineCore").value = state.core;
  $("inlineOther").value = state.other;
  if (state.mode === "scenario") scenarioRead();
}
function compare() {
  const a = [...state.compare].map(token);
  if (a.length < 2) {
    notify("Select at least two tokens to compare");
    return;
  }
  const deep = [...a].sort((a, b) => b.liquidity - a.liquidity)[0];
  $("comparison").innerHTML =
    `<div class="compare-intro"><h2>Same chain. Different market structure.</h2><p>Compare exact token contracts on Robinhood Chain · Snapshot from 10 Sep 2026</p></div><div class="compare-grid" style="--compare-columns:${a.length}">` +
    a
      .map((t) => {
        const q = t.txns24h,
          buys =
            q && q.buys + q.sells > 0
              ? (q.buys / (q.buys + q.sells)) * 100
              : null;
        return `<article class="compare-card"><div class="coin-head"><img src="${t.icon}" alt="${t.symbol}"><div><h3>${esc(t.symbol)}</h3><span>${esc(t.name)}</span></div></div><div class="compare-price">${price(t.price)}</div><dl><div><dt>24h price change</dt><dd class="${t.returns.h24 < 0 ? "negative" : "positive"}">${pct(t.returns.h24)}</dd></div><div><dt>Chain volume · 24h</dt><dd>${t.reportedChainVolumeDisplay}</dd></div><div><dt>Primary pool liquidity</dt><dd>${compact(t.liquidity)}</dd></div><div><dt>Primary pool vol. · 24h</dt><dd>${compact(t.volume24h)}</dd></div><div><dt>Buy share · txn count</dt><dd>${buys === null ? "Unavailable" : buys.toFixed(1) + "%"}</dd></div><div><dt>Observed eligible pools</dt><dd>${t.poolCount}</dd></div></dl><a href="${t.marketUrl}" target="_blank" rel="noopener">Inspect source pool ↗</a></article>`;
      })
      .join("") +
    `</div><div class="compare-read"><span>✳</span><div><b>Scout’s read</b><p><strong>${deep.symbol}</strong> has the largest primary-pool liquidity in this comparison at ${compact(deep.liquidity)}. That is an indexed reserve figure, not an executable depth quote. A token’s recent gain and buy-count share do not establish future returns.</p></div></div>`;
  $("compareDialog").showModal();
}
function inspect(id, pool = null) {
  const t = token(id);
  state.selected = id;
  focused();
  const p = pool || t.pools.find((p) => p.pairAddress === t.primaryPool),
    r = p.priceChange || {},
    liquidity = p.liquidity.usd,
    vol = p.volume?.h24;
  const turnover = Number.isFinite(vol) ? vol / liquidity : null;
  $("itemDetails").innerHTML =
    `<div class="token-detail"><div class="token-detail-head"><img src="${t.icon}" alt="${t.symbol}"><div><small>ROBINHOOD CHAIN · 4663</small><h2>${t.symbol}</h2><small>${esc(t.name)}</small></div><div class="token-price">${price(+p.priceUsd)}<span class="${r.h24 < 0 ? "negative" : "positive"}">${pct(r.h24)} / 24h</span></div></div><div class="token-metrics"><div><small>POOL LIQUIDITY</small><b>${compact(liquidity)}</b></div><div><small>POOL VOLUME · 24H</small><b>${compact(vol)}</b></div><div><small>VOL. / LIQUIDITY</small><b>${turnover === null ? "—" : turnover.toFixed(2) + "×"}</b></div></div><div class="token-contract">${t.contract}</div><div class="token-mini-heat">${["m5", "h1", "h6", "h24"].map((k, i) => `<div><small>${["5 MIN", "1 HOUR", "6 HOURS", "24 HOURS"][i]}</small>${heatCell(r[k])}</div>`).join("")}</div><p><strong>Scout’s read:</strong> Volume / liquidity is an activity ratio, not yield, a liquidity guarantee or a valuation. This pool is on ${esc(p.dexId)}; the source price and returns describe the base token in this exact pool.</p><p>Before a trade, obtain a fresh quote on the venue and review slippage, fees, gas and token-specific risks. ChainScout does not sign or submit transactions.</p></div><div class="detail-actions"><button id="detailCompare">Add to comparison</button><a href="${p.url}" target="_blank" rel="noopener">Open source market ↗</a></div>`;
  $("detailCompare").onclick = () => {
    addCompare(id);
    $("itemDialog").close();
  };
  $("itemDialog").showModal();
}
function addCompare(id) {
  if (state.compare.has(id)) state.compare.delete(id);
  else if (state.compare.size < 3) state.compare.add(id);
  else {
    notify("Compare up to three tokens; remove one first");
    return;
  }
  renderTable();
}
function methods() {
  $("methods").innerHTML =
    `<h3>Selection and timestamps</h3><p>Ten high-activity crypto tokens were selected from <a href="https://hoodexplorer.io/verified" target="_blank">HoodExplorer’s Robinhood Chain registry</a>, ordered by its displayed 24h chain volume. Tokenized stocks, ETFs and physical collectibles are excluded. The registry is not a complete chain census. Its rounded volumes are preserved as displayed and are not added together, because both sides of a trade may be counted.</p><p>DEX Screener pool data captured at ${esc(source.capturedAt)}. This page is a captured snapshot, not a continuously refreshed feed. Exact contracts and source markets are linked in the token table and detail panels.</p><h3>Pool observations and map</h3><p>${state.pools.length} unique pools across ten exact base-token contracts on chain 4663. Only pools quoted in native ETH, canonical WETH or USDG, with positive indexed liquidity, are retained. Responses are capped at up to 30 pools per token; therefore this is a bounded sample, not every pool. The chart additionally filters by your minimum liquidity, at least $1,000 in 24h pool volume and a reported 24h price change.</p><p>X = log10 24h pool volume; Y = symmetric-log 24h base-token price change; Z = log10 pool liquidity. Color identifies a token. Token comparisons use the highest-liquidity eligible captured pool for each exact contract. Different pool prices can disagree. Indexed reserve values are not executable order-book depth.</p><h3>Momentum and derived ratios</h3><p>Price changes for 5m, 1h, 6h and 24h are DEX Screener’s trailing windows. They overlap and are not an evenly spaced price history. Missing values remain unavailable. Buy share is buys / (buys + sells) by transaction count, not dollar flow. Turnover is 24h pool volume / current pool liquidity, not an investment return.</p><h3>Portfolio surface</h3><p>The $10,000 portfolio is hypothetical and uses fractional token quantities at captured pool prices. WETH weight is editable from 10% to 55%, offset against USDG; cbBTC stays 15%, PONS 20%, CASHCAT 10%. WETH and cbBTC share one user-set shock. PONS and CASHCAT share the other. USDG is assumed unchanged at its captured price, not guaranteed to keep a peg.</p><p>2,501 equally spaced parameter pairs cover 61 WETH/cbBTC shocks from −40% to +40% and 41 other-crypto shocks from −60% to +60%. They are deterministic scenarios with no probabilities, correlation model or return forecast.</p><p><code>Gross value = $10,000 × [1 + core weight × core shock + other weight × other shock]</code><br><code>Net = gross × (1 − user-set selling-cost rate); P/L = net − $10,000</code></p><p>Costs are assumptions, not quotes. Gas, taxes, slippage and actual venue fees may differ. The analyst text is deterministic source-based calculation and prompt routing; no live AI model is called. No transaction is signed or broadcast.</p><p><a href="https://docs.robinhood.com/chain/contracts/" target="_blank">Official WETH / USDG identities ↗</a> · <a href="https://docs.dexscreener.com/api/reference" target="_blank">DEX Screener API ↗</a></p>`;
  $("methodDialog").showModal();
}
function raw(x, y, z) {
  const cy = Math.cos(state.yaw),
    sy = Math.sin(state.yaw),
    cp = Math.cos(state.pitch),
    sp = Math.sin(state.pitch),
    rx = x * cy + z * sy,
    rz = -x * sy + z * cy,
    ry = y * cp - rz * sp,
    depth = y * sp + rz * cp,
    s = 5.4 / (5.4 - depth);
  return { x: rx * s * (w > 700 ? 1.65 : 1), y: ry * s, s, depth };
}
function pos(p) {
  return [
    ((Math.log10(Math.max(1, p.volume.h24)) - 3) / 6) * 2.8 - 1.4,
    ((Math.sign(p.priceChange.h24) *
      Math.log1p(Math.abs(p.priceChange.h24) / 10)) /
      Math.log(36)) *
      1.25,
    ((Math.log10(p.liquidity.usd) - 3) / 5) * 2.2 - 1.1,
  ];
}
function proj(x, y, z) {
  const p = raw(x, y, z);
  return { ...p, x: fitX + p.x * fitS, y: fitY - p.y * fitS };
}
function fit() {
  const xyz =
    state.mode === "atlas"
      ? eligible().map(pos)
      : [
          [-1.4, -1.3, -1],
          [1.4, 1.3, 1],
          [-1.4, 0.2, 1],
          [1.4, -0.2, -1],
        ];
  xyz.push(
    [-1.65, -1.55, -1.3],
    [1.8, -1.55, 1.4],
    [-1.65, 1.55, -1.3],
    [1.8, -1.55, -1.3],
  );
  const a = xyz.map((p) => raw(...p)),
    minX = Math.min(...a.map((p) => p.x)),
    maxX = Math.max(...a.map((p) => p.x)),
    minY = Math.min(...a.map((p) => p.y)),
    maxY = Math.max(...a.map((p) => p.y));
  fitS =
    Math.min((w * 0.83) / (maxX - minX), (h - 130) / (maxY - minY)) *
    state.zoom;
  fitX = w * 0.53 - ((minX + maxX) / 2) * fitS;
  fitY = 80 + (h - 130) / 2 + ((minY + maxY) / 2) * fitS;
}
function line(a, b, c = "#25475388", lw = 1, dash = []) {
  const p = proj(...a),
    q = proj(...b);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(q.x, q.y);
  ctx.strokeStyle = c;
  ctx.lineWidth = lw;
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.setLineDash([]);
}
function label(s, x, y, z, c = "#739da7", align = "center") {
  const p = proj(x, y, z);
  ctx.font = (w < 500 ? "7" : "9") + "px monospace";
  ctx.textAlign = align;
  ctx.fillStyle = c;
  ctx.fillText(s, p.x, p.y);
}
function floor() {
  for (let i = 0; i <= 12; i++)
    line(
      [-1.5 + i * 0.25, -1.45, -1.15],
      [-1.5 + i * 0.25, -1.45, 1.15],
      "#234b5766",
    );
  for (let i = 0; i <= 10; i++)
    line(
      [-1.5, -1.45, -1.15 + i * 0.23],
      [1.5, -1.45, -1.15 + i * 0.23],
      "#234b5766",
    );
}
function map() {
  floor();
  for (const v of [1e3, 1e5, 1e7, 1e9])
    label(compact(v), ((Math.log10(v) - 3) / 6) * 2.8 - 1.4, -1.58, 1.2);
  for (const v of [1e3, 1e5, 1e7, 1e8])
    label(
      compact(v) + " LIQ",
      1.76,
      -1.45,
      ((Math.log10(v) - 3) / 5) * 2.2 - 1.1,
    );
  line([-1.55, -1.4, -1.2], [-1.55, 1.45, -1.2]);
  for (const v of [-50, 0, 50, 300])
    label(
      (v > 0 ? "+" : "") + v + "%",
      -1.68,
      ((Math.sign(v) * Math.log1p(Math.abs(v) / 10)) / Math.log(36)) * 1.25,
      -1.2,
      "#81a0aa",
      "right",
    );
  line([-1.5, 0, -1.15], [1.5, 0, -1.15], "#9ccb7d60", 1, [4, 5]);
  projected = eligible()
    .map((p) => ({
      pool: p,
      t: token(p.tokenId),
      xyz: pos(p),
      ...proj(...pos(p)),
    }))
    .sort((a, b) => a.depth - b.depth);
  for (const p of projected) {
    const chosen =
        p.t.id === state.selected && p.pool.pairAddress === p.t.primaryPool,
      c = p.t.color,
      r = (chosen ? 6 : 3) * p.s;
    line([p.xyz[0], -1.45, p.xyz[2]], p.xyz, c + (chosen ? "70" : "16"));
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
    glow.addColorStop(0, c + (chosen ? "95" : "65"));
    glow.addColorStop(1, c + "00");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 4, 0, 7);
    ctx.fill();
    ctx.fillStyle = chosen ? "#f0f8df" : c;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, 7);
    ctx.fill();
    if (chosen) {
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 7, 0, 7);
      ctx.stroke();
      callout(
        p,
        p.t.symbol + " / " + p.pool.dexId,
        compact(p.pool.liquidity.usd) + " liquidity",
        c,
      );
    }
  }
  if (!projected.length) {
    ctx.textAlign = "center";
    ctx.font = "14px Arial";
    ctx.fillStyle = "#b8cbd0";
    ctx.fillText("No observed pools meet this filter.", w / 2, h / 2);
  }
}
function callout(p, top, bottom, color = "#c1f586") {
  const x = Math.max(14, Math.min(w - 201, p.x + 22)),
    y = Math.max(93, Math.min(h - 82, p.y - 47));
  ctx.beginPath();
  ctx.roundRect(x, y, 185, 53, 6);
  ctx.fillStyle = "#11242ded";
  ctx.strokeStyle = color + "bb";
  ctx.lineWidth = 0.8;
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillStyle = "#c8ddd9";
  ctx.font = "9px monospace";
  ctx.fillText(top, x + 11, y + 18);
  ctx.fillStyle = color;
  ctx.font = "15px Arial";
  ctx.fillText(bottom, x + 11, y + 40);
}
const cloud = [];
for (let x = 0; x <= 60; x++)
  for (let z = 0; z <= 40; z++)
    cloud.push({
      core: -40 + (x * 80) / 60,
      other: -60 + z * 3,
      x: (x / 60) * 2.8 - 1.4,
      z: (z / 40) * 2.2 - 1.1,
      xi: x,
      zi: z,
    });
const cloudColor = (pl, a = 0.9) => {
  const t = Math.max(0, Math.min(1, (pl + 5000) / 10000));
  return `rgba(${Math.round(242 - 140 * t)},${Math.round(125 + 115 * t)},${Math.round(160 + 40 * t)},${a})`;
};
function surface() {
  floor();
  const a = cloud.map((p) => ({ ...p, pl: scenario(p.core, p.other).pl }));
  for (const p of a) p.y = (p.pl / 5000) * 1.32;
  if (state.mesh) {
    for (let x = 0; x <= 60; x += 3)
      for (let z = 0; z < 40; z++) {
        const p = a[x * 41 + z],
          q = a[x * 41 + z + 1];
        line([p.x, p.y, p.z], [q.x, q.y, q.z], cloudColor(p.pl, 0.33), 0.7);
      }
    for (let z = 0; z <= 40; z += 4)
      for (let x = 0; x < 60; x++) {
        const p = a[x * 41 + z],
          q = a[(x + 1) * 41 + z];
        line([p.x, p.y, p.z], [q.x, q.y, q.z], cloudColor(p.pl, 0.33), 0.7);
      }
  }
  projected = a
    .map((p) => ({ ...p, xyz: [p.x, p.y, p.z], ...proj(p.x, p.y, p.z) }))
    .sort((a, b) => a.depth - b.depth);
  for (const p of projected) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, (state.mesh ? 1.1 : 1.6) * p.s, 0, 7);
    ctx.fillStyle = cloudColor(p.pl);
    ctx.fill();
  }
  for (const v of [-40, -20, 0, 20, 40])
    label((v > 0 ? "+" : "") + v + "%", (v / 40) * 1.4, -1.57, 1.24);
  for (const v of [-60, 0, 60])
    label((v > 0 ? "+" : "") + v + "% OTHER", 1.78, -1.45, (v / 60) * 1.1);
  line([-1.6, -1.4, -1.18], [-1.6, 1.45, -1.18]);
  label("−$5K", -1.76, -1.32, -1.18);
  label("$0", -1.76, 0, -1.18);
  label("+$5K", -1.76, 1.32, -1.18);
  const r = scenario(),
    xyz = [
      (state.core / 40) * 1.4,
      (r.pl / 5000) * 1.32,
      (state.other / 60) * 1.1,
    ],
    p = proj(...xyz);
  line([xyz[0], -1.45, xyz[2]], xyz, "#d9f7ac99", 1, [3, 4]);
  ctx.shadowColor = "#d5f891";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "#edffc4";
  ctx.beginPath();
  ctx.arc(p.x, p.y, 7, 0, 7);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#d9f6ac";
  ctx.beginPath();
  ctx.arc(p.x, p.y, 15, 0, 7);
  ctx.stroke();
  callout(
    p,
    `${state.core}% CORE / ${state.other}% OTHER`,
    (r.pl < 0 ? "−" : "+") + usd(Math.abs(r.pl)),
    r.pl < 0 ? "#ffad93" : "#c1f586",
  );
}
function resize() {
  const r = canvas.getBoundingClientRect();
  w = r.width;
  h = r.height;
  const d = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * d);
  canvas.height = Math.round(h * d);
  ctx.setTransform(d, 0, 0, d, 0, 0);
}
function draw(now) {
  const dt = Math.min(40, now - last || 16);
  last = now;
  if (state.rotating && !drag && !hover) state.yaw += dt * 0.000023;
  ctx.clearRect(0, 0, w, h);
  if (state.tokens.length) {
    fit();
    state.mode === "atlas" ? map() : surface();
  }
  requestAnimationFrame(draw);
}
function pick(x, y) {
  let best,
    dist = 19;
  for (const p of projected) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < dist) {
      best = p;
      dist = d;
    }
  }
  return best;
}
canvas.onpointerdown = (e) => {
  drag = {
    x: e.clientX,
    y: e.clientY,
    ox: e.clientX,
    oy: e.clientY,
    moved: false,
  };
  canvas.setPointerCapture(e.pointerId);
  $("chartTooltip").hidden = true;
};
canvas.onpointermove = (e) => {
  if (drag) {
    state.yaw += (e.clientX - drag.x) * 0.006;
    state.pitch = Math.max(
      -0.1,
      Math.min(1.12, state.pitch + (e.clientY - drag.y) * 0.004),
    );
    drag.moved ||= Math.hypot(e.clientX - drag.ox, e.clientY - drag.oy) > 5;
    drag.x = e.clientX;
    drag.y = e.clientY;
    return;
  }
  const b = canvas.getBoundingClientRect(),
    x = e.clientX - b.left,
    y = e.clientY - b.top;
  hover = pick(x, y);
  if (hover && state.mode === "atlas") {
    $("chartTooltip").innerHTML =
      `<img src="${hover.t.icon}" alt=""><b>${hover.t.symbol} / ${hover.pool.quoteToken.symbol}</b><small>${compact(hover.pool.liquidity.usd)} liquidity · ${pct(hover.pool.priceChange.h24)} / 24h</small>`;
    $("chartTooltip").style.left =
      Math.min(w - 235, Math.max(5, x + 15)) + "px";
    $("chartTooltip").style.top = Math.min(h - 85, Math.max(90, y - 45)) + "px";
    $("chartTooltip").hidden = false;
  } else $("chartTooltip").hidden = true;
};
canvas.onpointerup = (e) => {
  const d = drag;
  drag = null;
  if (d && !d.moved) {
    const b = canvas.getBoundingClientRect(),
      p = pick(e.clientX - b.left, e.clientY - b.top);
    if (p)
      state.mode === "atlas"
        ? inspect(p.t.id, p.pool)
        : ((state.core = Math.round(p.core)),
          (state.other = Math.round(p.other)),
          portfolio());
  }
};
canvas.onpointercancel = () => (drag = null);
canvas.onpointerleave = () => {
  hover = null;
  $("chartTooltip").hidden = true;
};
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    state.zoom = Math.max(0.6, Math.min(1.6, state.zoom - e.deltaY * 0.001));
  },
  { passive: false },
);
canvas.onkeydown = (e) => {
  if (
    ![
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "+",
      "=",
      "-",
    ].includes(e.key)
  )
    return;
  e.preventDefault();
  if (e.key === "ArrowLeft") state.yaw -= 0.1;
  if (e.key === "ArrowRight") state.yaw += 0.1;
  if (e.key === "ArrowUp") state.pitch = Math.max(-0.1, state.pitch - 0.06);
  if (e.key === "ArrowDown") state.pitch = Math.min(1.12, state.pitch + 0.06);
  if (e.key === "+" || e.key === "=")
    state.zoom = Math.min(1.6, state.zoom + 0.1);
  if (e.key === "-") state.zoom = Math.max(0.6, state.zoom - 0.1);
};
const focus = () => {
  const active = document
    .querySelector(".lab-layout")
    .classList.toggle("immersive");
  document.body.classList.toggle("focus-mode", active);
  $("focusBoard").setAttribute("aria-pressed", active);
  $("focusBoard").setAttribute(
    "aria-label",
    active ? "Exit focus view" : "Expand 3D board",
  );
  $("focusBoard").innerHTML = active
    ? "⤡ <span>Exit focus</span>"
    : "⤢ <span>Focus view</span>";
  resize();
};
$("focusBoard").onclick = focus;
$("resetView").onclick = () => {
  state.yaw = state.mode === "atlas" ? -0.48 : -0.56;
  state.pitch = state.mode === "atlas" ? 0.38 : 0.57;
  state.zoom = 1;
};
$("autoRotate").onclick = () => {
  state.rotating = !state.rotating;
  $("autoRotate").textContent = state.rotating ? "Ⅱ" : "▷";
  $("autoRotate").setAttribute("aria-pressed", state.rotating);
  $("autoRotate").setAttribute(
    "aria-label",
    state.rotating ? "Pause rotation" : "Start rotation",
  );
};
$("zoomIn").onclick = () => (state.zoom = Math.min(1.6, state.zoom + 0.1));
$("zoomOut").onclick = () => (state.zoom = Math.max(0.6, state.zoom - 0.1));
$("meshToggle").onclick = () => {
  state.mesh = !state.mesh;
  $("meshToggle").setAttribute("aria-pressed", state.mesh);
};
$("atlasTab").onclick = () => mode("atlas");
$("scenarioTab").onclick = () => mode("scenario");
$("readBoard").onclick = () =>
  state.mode === "atlas" ? marketRead(true) : scenarioRead(true);
const stress = () => {
  mode("scenario");
  if (!document.body.classList.contains("focus-mode"))
    document
      .querySelector(".lab-layout")
      .scrollIntoView({ behavior: "smooth", block: "center" });
};
["stressPortfolio", "railStress", "openScenario"].forEach(
  (id) => ($(id).onclick = stress),
);
["overviewNav", "railAtlas"].forEach(
  (id) =>
    ($(id).onclick = () => {
      mode("atlas");
      scrollTo({ top: 0, behavior: "smooth" });
    }),
);
["openCompare", "compareNav", "railCompare"].forEach(
  (id) => ($(id).onclick = compare),
);
$("compareLeaders").onclick = () => {
  state.compare = new Set(["weth", "pons", "cashcat"]);
  renderTable();
  compare();
};
$("portfolioNav").onclick = () =>
  $("portfolioPanel").scrollIntoView({ behavior: "smooth", block: "center" });
["railMethods", "sourceButton", "methodButton"].forEach(
  (id) => ($(id).onclick = methods),
);
$$("[data-close]").forEach(
  (b) => (b.onclick = () => $(b.dataset.close).close()),
);
document.addEventListener("keydown", (e) => {
  if (
    e.key === "Escape" &&
    !document.querySelector("dialog[open]") &&
    document.body.classList.contains("focus-mode")
  )
    focus();
});
$("tokenStrip").onclick = (e) => {
  const b = e.target.closest("[data-filter]");
  if (!b) return;
  state.filter = b.dataset.filter;
  if (state.filter !== "all") state.selected = state.filter;
  renderStrip();
  mode("atlas");
};
$("minLiquidity").onchange = (e) => {
  state.min = +e.target.value;
  $("visibleCount").textContent =
    `${eligible().length} / ${state.pools.length} pools plotted`;
};
$("assetRows").onclick = (e) => {
  const b = e.target.closest("[data-inspect]"),
    c = e.target.closest("[data-compare]");
  if (b) inspect(b.dataset.inspect);
  if (c) addCompare(c.dataset.compare);
};
$("showAll").onclick = () => {
  state.all = !state.all;
  renderTable();
};
$("focusedAsset").onclick = (e) => {
  const b = e.target.closest("[data-focused]");
  if (b) inspect(b.dataset.focused);
};
$("inlineCore").oninput = (e) => {
  state.core = +e.target.value;
  portfolio();
};
$("inlineOther").oninput = (e) => {
  state.other = +e.target.value;
  portfolio();
};
$("weightSlider").max = 55;
$("weightSlider").oninput = (e) => {
  state.weight = +e.target.value;
  portfolio();
};
$("feeSlider").oninput = (e) => {
  state.fee = +e.target.value;
  portfolio();
};
$("analystForm").onsubmit = (e) => {
  e.preventDefault();
  const q = $("analystInput").value.trim().toLowerCase();
  $("analystInput").value = "";
  if (!q) return;
  if (/compar/.test(q)) {
    const ids = state.tokens
      .filter((t) => q.includes(t.symbol.toLowerCase()))
      .map((t) => t.id);
    state.compare = new Set(
      ids.length >= 2 ? ids.slice(0, 3) : ["weth", "pons", "cashcat"],
    );
    renderTable();
    compare();
  } else if (/stress|portfolio|shock|allocat/.test(q)) stress();
  else if (/correlat|volatil|var|sharpe|forecast|predict/.test(q))
    explain(
      "DATA BOUNDARY",
      "Don’t invent<br>the missing history.",
      [
        "This snapshot supports pool comparisons and explicit stress assumptions. It has <strong>no historical return series</strong> for a defensible correlation, volatility or Sharpe estimate.",
        "The price-change windows overlap. They cannot substitute for a synchronized return history.",
      ],
      ["Source-limited", "No fabricated risk metric"],
      true,
    );
  else marketRead(true);
};
$("retryData").onclick = () => location.reload();
$("autoRotate").textContent = state.rotating ? "Ⅱ" : "▷";
$("autoRotate").setAttribute("aria-pressed", state.rotating);
$("autoRotate").setAttribute(
  "aria-label",
  state.rotating ? "Pause rotation" : "Start rotation",
);
window.cryptoLab = {
  state,
  scenario,
  weights,
  eligible,
  mode,
  inspect,
  get projected() {
    return projected;
  },
};
fetch("crypto-data.json")
  .then((r) => {
    if (!r.ok) throw new Error("Data unavailable");
    return r.json();
  })
  .then((d) => {
    if (
      d.chainId !== 4663 ||
      !Array.isArray(d.tokens) ||
      d.tokens.length !== 10 ||
      d.tokens.some((t) => !Number.isFinite(t.price) || t.price <= 0)
    )
      throw new Error("Invalid crypto data");
    source = d;
    $("captureStamp").textContent =
      "Market snapshot · " +
      new Date(d.capturedAt).toLocaleString("en-GB", {
        timeZone: "UTC",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }) +
      " UTC · Prices are captured observations.";
    state.tokens = d.tokens;
    state.pools = d.tokens.flatMap((t) => t.pools);
    if (
      new Set(state.pools.map((p) => p.pairAddress)).size !==
        state.pools.length ||
      state.pools.some(
        (p) =>
          p.chainId !== "robinhood" ||
          p.baseToken.address.toLowerCase() !== token(p.tokenId).contract,
      )
    )
      throw new Error("Invalid pool identities");
    const deep = [...d.tokens].sort((a, b) => b.liquidity - a.liquidity)[0],
      mover = [...d.tokens].sort(
        (a, b) => (b.returns.h24 ?? -Infinity) - (a.returns.h24 ?? -Infinity),
      )[0];
    $("poolCount").textContent = state.pools.length;
    $("biggestMove").textContent = "+" + Math.round(mover.returns.h24) + "%";
    $("moverName").textContent = mover.symbol + " · primary observed pool";
    $("deepest").textContent = compact(deep.liquidity);
    $("deepestName").textContent = deep.symbol + " · primary observed pool";
    renderStrip();
    renderTable();
    renderHeat();
    portfolio();
    mode("atlas");
    resize();
    new ResizeObserver(resize).observe(canvas);
    requestAnimationFrame(draw);
    document.body.dataset.ready = "true";
    document
      .querySelectorAll("[inert]")
      .forEach((el) => el.removeAttribute("inert"));
  })
  .catch((e) => {
    console.error(e);
    $("loadError").hidden = false;
  });
