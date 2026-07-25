function ArtCube() {
  return (
    <svg viewBox="0 0 200 150" className="h-full w-full" fill="none" stroke="#635d5a" strokeWidth="1.1">
      <path d="M100 25 160 60 100 95 40 60Z" fill="#e9e0d1" />
      <path d="M40 60 100 95 100 140 40 105Z" fill="#d6ccba" />
      <path d="M160 60 100 95 100 140 160 105Z" fill="#ccbd9f" />
    </svg>
  );
}
function ArtTorus() {
  return (
    <svg viewBox="0 0 200 150" className="h-full w-full" fill="none" stroke="#635d5a" strokeWidth="1.1">
      <ellipse cx="100" cy="75" rx="62" ry="40" fill="#e9e0d1" />
      <ellipse cx="100" cy="75" rx="62" ry="40" />
      <ellipse cx="100" cy="72" rx="24" ry="15" fill="#d6ccba" />
      <ellipse cx="100" cy="72" rx="24" ry="15" />
      <path d="M38 75c0 22 28 40 62 40s62-18 62-40" stroke="#635d5a" />
    </svg>
  );
}
function ArtHex() {
  return (
    <svg viewBox="0 0 200 150" className="h-full w-full" fill="none" stroke="#635d5a" strokeWidth="1.1">
      <path d="M100 30 152 55v50l-52 25-52-25V55Z" fill="#e9e0d1" />
      <path d="M100 30 152 55v50l-52 25-52-25V55Z" />
      <ellipse cx="100" cy="78" rx="20" ry="11" fill="#d6ccba" />
      <ellipse cx="100" cy="78" rx="20" ry="11" />
      <path d="M48 105 100 130 152 105" opacity="0.6" />
    </svg>
  );
}

const POSTS = [
  { t: "How to Read a Robinhood Chain Transaction", c: "Guides", d: "Apr 8, 2026", art: <ArtCube /> },
  { t: "What Token Approvals Mean and Why They Matter", c: "Guides", d: "Mar 15, 2026", art: <ArtTorus /> },
  { t: "Why Blockchain Explorers Need AI", c: "Notes", d: "Feb 28, 2026", art: <ArtHex /> },
];

export default function Blog() {
  return (
    <section id="insights" className="px-4 pb-10 md:px-8">
      <div className="clip-panel bg-[#e9e0d1] px-8 py-14 text-[#1d1d1d] md:px-14">
        <div className="mb-10 flex items-center gap-3 border-y border-[#1d1d1d]/15 py-3">
          <span className="h-1.5 w-1.5 rounded-full bg-[#1d1d1d]" />
          <span className="font-mono-d text-[12px] text-[#1d1d1d]/70">Blog</span>
          <span className="hatch-dark h-3 flex-1" />
        </div>
        <div className="mb-14 grid grid-cols-1 gap-8 xl:grid-cols-2">
          <h2 className="text-[40px] font-medium leading-[1.06] tracking-[-0.03em] md:text-[54px]">
            Guides, notes, and
            <br />
            launch content
          </h2>
          <p className="max-w-[420px] self-end text-[14.5px] leading-relaxed text-[#1d1d1d]/70 xl:justify-self-end">
            Practical writing on transactions, approvals, and making on-chain activity readable
            for everyone.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {POSTS.map((p) => (
            <a key={p.t} href="#insights" className="group flex flex-col border border-[#1d1d1d]/15 bg-[#f0e8da]">
              <div className="hatch-dark relative h-[220px] border-b border-[#1d1d1d]/15 p-8 opacity-90">
                {p.art}
              </div>
              <div className="flex flex-1 flex-col justify-between p-7">
                <h3 className="text-[19px] font-medium leading-snug tracking-tight transition-colors group-hover:text-[#fa6c34]">
                  {p.t}
                </h3>
                <div className="mt-8 flex items-center justify-between border-t border-[#1d1d1d]/15 pt-4 text-[12.5px] text-[#1d1d1d]/60">
                  <span>{p.c}</span>
                  <span className="font-mono-d">{p.d}</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
