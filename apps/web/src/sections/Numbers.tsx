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
          <span className="font-mono-d text-[12px] text-[#1d1d1d]/70">Auditable limits</span>
          <span className="hatch-dark h-3 flex-1" />
        </div>
        <div className="mb-14 grid grid-cols-1 gap-8 xl:grid-cols-2">
          <h2 className="text-[40px] font-medium leading-[1.06] tracking-[-0.03em] md:text-[54px]">
            Hard limits,
            <br />
            stated plainly
          </h2>
          <p className="max-w-[420px] self-end text-[14.5px] leading-relaxed text-[#1d1d1d]/70 xl:justify-self-end">
            These are product constraints enforced in code—not simulated usage, accuracy, latency,
            or uptime claims.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="flex flex-col gap-4">
            <Card title="CHAIN ID" sub="Robinhood Chain mainnet">
              <p className="font-num mt-4 text-[40px] leading-none">4663</p>
            </Card>
            <Card title="APPROVED ADDRESS" sub="Per explicit portfolio refresh" className="flex-1">
              <p className="font-num mt-4 text-[44px] leading-none">1</p>
              <p className="mt-5 max-w-[240px] text-[13.5px] leading-relaxed text-[#1d1d1d]/65">
                The browser sends ChainScout only the approved address. Other saved addresses and private context stay encrypted locally; direct verification may derive additional public chain identifiers server-side.
              </p>
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <Card title="ZERO-COST SAFETY" sub="Enforced server limits">
              <div className="mt-6 space-y-5">
                {[
                  ["RPC subcalls / snapshot", "64", 64],
                  ["Shared RPC units / UTC day", "5,000", 50],
                  ["Refreshes / rate-limit identity / hour", "10", 10],
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
            <Card title="BOUNDED CANDIDATES" sub="Maximum evaluated per snapshot" className="flex-1">
              <div className="mt-6 grid grid-cols-2 gap-px bg-[#1d1d1d]/15">
                {[["ERC-20", "10"], ["NFT", "10"], ["TRANSACTIONS", "10"], ["APPROVALS", "10"]].map(([label, value]) => (
                  <div key={label} className="bg-[#f0e8da] p-4">
                    <p className="font-num text-[32px] leading-none">{value}</p>
                    <p className="mt-2 font-mono-d text-[9.5px] text-[#1d1d1d]/55">{label}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="flex flex-col gap-4 md:col-span-2 xl:col-span-1">
            <Card title="ANCHOR HASH" sub="Captured, then rechecked">
              <p className="font-num mt-4 text-[40px] leading-none">2×</p>
              <p className="mt-3 text-[13px] leading-relaxed text-[#1d1d1d]/65">A changed current-block hash discards the entire response.</p>
            </Card>
            <Card title="MOVEMENTS RETURNED" sub="Sorted, receipt-decoded maximum">
              <p className="font-num mt-4 text-[40px] leading-none">≤40</p>
            </Card>
            <Card title="SERVER PORTFOLIO COPY" sub="Queries and snapshot responses" className="flex-1">
              <p className="font-num mt-4 text-[40px] leading-none">NONE</p>
              <p className="mt-5 text-[13.5px] leading-relaxed text-[#1d1d1d]/65">
                The useful ownership context is encrypted in the browser Vault. A failed refresh leaves the prior snapshot unchanged; partial provider results are visibly marked.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
