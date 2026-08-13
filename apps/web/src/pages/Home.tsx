import Sidebar from "../sections/Sidebar";
import TopNav from "../sections/TopNav";
import Hero from "../sections/Hero";
import Overview from "../sections/Overview";
import Capabilities from "../sections/Capabilities";
import Numbers from "../sections/Numbers";
import Features from "../sections/Features";
import Integrations from "../sections/Integrations";
import Comparison from "../sections/Comparison";
import Safety from "../sections/Safety";
import Blog from "../sections/Blog";
import Faq from "../sections/Faq";
import FooterCta from "../sections/FooterCta";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#1d1d1d]">
      <a href="#marketing-main" onClick={(event) => { event.preventDefault(); document.getElementById("marketing-main")?.focus(); window.history.replaceState(null, "", "#marketing-main"); }} className="fixed left-3 top-3 z-[120] -translate-y-24 bg-[#fa6c34] px-4 py-3 font-mono-d text-[10px] font-semibold text-[#1d1d1d] outline-none transition-transform focus:translate-y-0 focus-visible:ring-2 focus-visible:ring-white">SKIP TO MAIN CONTENT</a>
      <Sidebar />
      <TopNav />
      <main id="marketing-main" tabIndex={-1} className="outline-none lg:pl-[220px]">
        <div className="pt-[60px]">
          <Hero />
          <Overview />
          <Capabilities />
          <Numbers />
          <Features />
          <Integrations />
          <Comparison />
          <Safety />
          <Blog />
          <Faq />
          <FooterCta />
        </div>
      </main>
    </div>
  );
}
