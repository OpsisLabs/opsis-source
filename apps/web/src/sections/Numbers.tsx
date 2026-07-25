const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const BARS = [28, 46, 58, 52, 88, 34, 26];

function LayersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" fill="none" strokeWidth="1.2">
      <path d="M8 1 15 5 8 9 1 5Z" />
      <path d="M1 8.5 8 12.5 15 8.5" />
      <path d="M1 12 8 16 15 12" />
    </svg>
  );
}

function Card({
  title,
  sub,
  children,
  className = "",
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`border border-[#1d1d1d]/15 bg-[#f0e8da] p-6 ${className}`}>
      <div className="mb-1 flex items-start justify-between">
        <div>
          <h4 className="font-mono-d text-[12px] font-medium tracking-wide text-[#1d1d1d]">{title}</h4>
          {sub && <p className="mt-1 text-[12.5px] text-[#1d1d1d]/60">{sub}</p>}
        </div>
        <span className="text-[#1d1d1d]/50">
          <LayersIcon />
        </span>
      </div>
      {children}
    </div>
  );
}

export default function Numbers() {
  return (
    <section id="numbers" className="px-4 pb-10 md:px-8">
      <div className="clip-panel bg-[#e9e0d1] px-8 py-14 text-[#1d1d1d] md:px-14">
        <div className="mb-10 flex items-center gap-3 border-y border-[#1d1d1d]/15 py-3">
          <span className="h-1.5 w-1.5 rounded-full bg-[#1d1d1d]" />
          <span className="font-mono-d text-[12px] text-[#1d1d1d]/70">Numbers</span>
          <span className="hatch-dark h-3 flex-1" />
        </div>
        <div className="mb-14 grid grid-cols-1 gap-8 xl:grid-cols-2">
          <h2 className="text-[40px] font-medium leading-[1.06] tracking-[-0.03em] md:text-[54px]">
            Built for production
            <br />
            from day one
          </h2>
          <p className="max-w-[420px] self-end text-[14.5px] leading-relaxed text-[#1d1d1d]/70 xl:justify-self-end">
            Clear visibility into answers, citations, and provider performance across the stack.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {/* column 1 */}
          <div className="flex flex-col gap-4">
            <Card title="WEEKLY ANSWERS" sub="Chat + entity lookups" className="flex-1">
              <p className="font-num mt-4 text-[44px] leading-none">12,408</p>
              <div className="relative mt-6">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-[220px]">
                  {[0.25, 0.5, 0.75].map((f) => (
                    <div key={f} className="absolute inset-x-0 border-t border-[#1d1d1d]/10" style={{ top: `${f * 100}%` }} />
                  ))}
                </div>
                <div className="flex h-[220px] items-end gap-2 border-b border-[#1d1d1d]/30">
                  {BARS.map((h, i) => (
                    <div key={i} className="flex flex-1 flex-col justify-end" style={{ height: "100%" }}>
                      <div
                        className={`border-t-2 border-[#1d1d1d] ${i === 4 ? "hatch-orange bg-[#fa6c34]" : "bg-[#d6ccba]"}`}
                        style={{ height: `${h}%` }}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                {DAYS.map((d) => (
                  <span key={d} className="flex-1 text-center font-mono-d text-[10px] text-[#1d1d1d]/50">
                    {d}
                  </span>
                ))}
              </div>
            </Card>
            <Card title="CHAIN ID" sub="Robinhood Chain mainnet">
              <p className="font-num mt-4 text-[40px] leading-none">4663</p>
            </Card>
          </div>

          {/* column 2 */}
          <div className="flex flex-col gap-4">
            <Card title="LOOKUP QUOTA" sub="">
              <div className="mt-6 space-y-5">
                {[
                  ["Chain lookups / month", "5,000", 92],
                  ["AI messages / month", "500", 40],
                  ["Lookups per hour", "120", 30],
                ].map(([l, v, w]) => (
                  <div key={l as string}>
                    <div className="mb-2 flex justify-between text-[13px]">
                      <span className="text-[#1d1d1d]/75">{l}</span>
                      <span className="font-semibold">{v}</span>
                    </div>
                    <div className="h-[3px] w-full bg-[#1d1d1d]/12">
                      <div className="h-full bg-[#1d1d1d]" style={{ width: `${w}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="ANSWER ACCURACY" sub="Cited vs. uncited claims" className="flex-1">
              <p className="font-num mt-4 text-[40px] leading-none">98.4%</p>
              <div className="mt-5 flex h-[120px] items-end gap-3">
                <div className="flex flex-1 flex-col items-center justify-end gap-2 self-stretch">
                  <div className="hatch-dark w-full border border-[#1d1d1d]/30" style={{ height: 54 }} />
                  <span className="font-mono-d text-[10px] text-[#1d1d1d]/50">UNCITED</span>
                </div>
                <div className="flex flex-1 flex-col items-center justify-end gap-2 self-stretch">
                  <div className="hatch-orange w-full bg-[#fa6c34]" style={{ height: 96 }} />
                  <span className="font-mono-d text-[10px] text-[#1d1d1d]/50">CITED</span>
                </div>
              </div>
            </Card>
          </div>

          {/* column 3 */}
          <div className="flex flex-col gap-4 md:col-span-2 xl:col-span-1">
            <Card title="MEDIAN ANSWER" sub="End-to-end latency">
              <div className="mt-6 flex items-end justify-between gap-6">
                <p className="font-num text-[40px] leading-none">3.2s</p>
                <svg width="150" height="46" viewBox="0 0 150 46" className="text-[#1d1d1d]">
                  {Array.from({ length: 24 }).map((_, i) => {
                    const h = 4 + Math.pow(i, 1.6) * 0.28;
                    return <line key={i} x1={i * 6 + 2} y1={46} x2={i * 6 + 2} y2={46 - Math.min(h, 44)} stroke="currentColor" strokeWidth="2" />;
                  })}
                </svg>
              </div>
            </Card>
            <Card title="RESOLUTION MODE" sub="">
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[13px] text-[#1d1d1d]/60">AI answer</p>
                  <p className="font-num mt-1 text-[38px] leading-none">86%</p>
                </div>
                <div>
                  <p className="text-[13px] text-[#1d1d1d]/60">Fallback</p>
                  <p className="font-num mt-1 text-[38px] leading-none">14%</p>
                </div>
              </div>
            </Card>
            <Card title="PROVIDER UPTIME" sub="Blockscout + Alchemy" className="flex-1">
              <p className="font-num mt-4 text-[40px] leading-none">99.95%</p>
              <svg viewBox="0 0 300 90" className="mt-5 w-full">
                {Array.from({ length: 30 }).map((_, col) =>
                  Array.from({ length: 7 }).map((_, row) => {
                    const limit = 1.5 + col * 0.19;
                    const on = 7 - row <= limit;
                    return (
                      <rect
                        key={`${col}-${row}`}
                        x={col * 10}
                        y={row * 12 + 2}
                        width="7"
                        height="8"
                        fill={on ? "#1d1d1d" : "none"}
                        stroke="#1d1d1d"
                        strokeOpacity={on ? 0 : 0.25}
                        strokeWidth="0.6"
                      />
                    );
                  })
                )}
              </svg>
              <div className="mt-1 flex justify-between font-mono-d text-[10px] text-[#1d1d1d]/50">
                <span>1</span>
                <span>15</span>
                <span>30</span>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
