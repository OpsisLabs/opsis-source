function ArtCircles() {
  return (
    <svg viewBox="0 0 200 150" className="h-full w-full" fill="none" stroke="#1d1d1d" strokeWidth="1">
      <circle cx="100" cy="55" r="38" opacity="0.8" />
      <circle cx="72" cy="92" r="38" opacity="0.8" />
      <circle cx="128" cy="92" r="38" opacity="0.8" />
      <path d="M100 73c8 5 12 13 12 19-8 4-16 4-24 0 0-6 4-14 12-19Z" fill="#1d1d1d" fillOpacity="0.12" stroke="none" />
      <g strokeOpacity="0.5">
        <line x1="88" y1="80" x2="112" y2="96" />
        <line x1="92" y1="76" x2="116" y2="92" />
        <line x1="84" y1="84" x2="108" y2="100" />
      </g>
    </svg>
  );
}

function ArtTriangles() {
  return (
    <svg viewBox="0 0 200 150" className="h-full w-full" fill="none" stroke="#1d1d1d" strokeWidth="1">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <path key={i} d={`M100 ${20 + i * 3} L${30 + i * 11} 125 L${170 - i * 11} 125 Z`} opacity={0.9 - i * 0.12} />
      ))}
      <line x1="100" y1="20" x2="100" y2="125" opacity="0.5" />
    </svg>
  );
}

function ArtArcs() {
  return (
    <svg viewBox="0 0 200 150" className="h-full w-full" fill="none" stroke="#1d1d1d" strokeWidth="1">
      {[64, 52, 40, 28, 16].map((r, i) => (
        <circle key={r} cx="100" cy={110 - i * 4} r={r} opacity={0.85 - i * 0.08} />
      ))}
      <line x1="20" y1="125" x2="180" y2="125" opacity="0.4" />
    </svg>
  );
}

const FEATURES = [
  {
    t: "Entity Resolution",
    n: "001",
    d: "Paste any address or hash. The system classifies it as wallet, transaction, token, or contract, then retrieves the right data bundle.",
    art: <ArtCircles />,
  },
  {
    t: "Risk Heuristics",
    n: "002",
    d: "Deterministic signals, such as unverified contracts, failed transactions, and large or unlimited approvals, labeled as evidence or inference.",
    art: <ArtTriangles />,
  },
  {
    t: "Source Citations",
    n: "003",
    d: "Every answer ships with machine-readable citations: provider, timestamp, fields used, and a direct link to the explorer.",
    art: <ArtArcs />,
  },
];

export default function Features() {
  return (
    <section id="features" className="px-4 pb-10 md:px-8">
      <div className="clip-panel bg-[#e9e0d1] px-8 py-14 text-[#1d1d1d] md:px-14">
        <div className="mb-10 flex items-center gap-3 border-y border-[#1d1d1d]/15 py-3">
          <span className="h-1.5 w-1.5 rounded-full bg-[#1d1d1d]" />
          <span className="font-mono-d text-[12px] text-[#1d1d1d]/70">Features</span>
          <span className="hatch-dark h-3 flex-1" />
        </div>
        <div className="mb-14 grid grid-cols-1 gap-8 xl:grid-cols-2">
          <h2 className="text-[40px] font-medium leading-[1.06] tracking-[-0.03em] md:text-[54px]">
            Core systems behind
            <br />
            every answer
          </h2>
          <p className="max-w-[420px] self-end text-[14.5px] leading-relaxed text-[#1d1d1d]/70 xl:justify-self-end">
            Retrieval, normalization, and risk analysis run before the AI speaks, so answers
            stay grounded in what actually happened on-chain.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.t} className="flex flex-col border border-[#1d1d1d]/15 bg-[#f0e8da]">
              <div className="flex items-baseline justify-between px-7 pt-7">
                <h3 className="text-[20px] font-medium">{f.t}</h3>
                <span className="font-mono-d text-[12px] text-[#1d1d1d]/40">{f.n}</span>
              </div>
              <div className="ticks mx-7 mt-6 h-[240px] text-[#1d1d1d]/50">
                <div className="hatch-dark absolute inset-0 opacity-40" />
                <div className="relative h-full w-full p-6">{f.art}</div>
              </div>
              <p className="px-7 py-7 text-[14px] leading-relaxed text-[#1d1d1d]/70">{f.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
