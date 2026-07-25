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
      <Sidebar />
      <TopNav />
      <main className="lg:pl-[220px]">
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
