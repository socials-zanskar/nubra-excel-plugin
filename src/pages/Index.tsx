import { NavBar } from "@/components/NavBar";
import { HeroSection } from "@/components/HeroSection";
import { CodeDemoSection } from "@/components/CodeDemoSection";
import { TradingEnvironmentSection } from "@/components/TradingEnvironmentSection";
import { PricingSection } from "@/components/PricingSection";
import { Footer } from "@/components/Footer";

const SectionDivider = () => (
  <div className="w-full">
    <div className="border-t border-dashed border-[#5E5E76]/30" />
  </div>
);

const Index = () => {
  return (
    <main 
      className="min-h-screen"
      style={{ 
        backgroundImage: "url('/images/bg-2.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }}
    >
      <NavBar />
      <HeroSection />
      <SectionDivider />
      <CodeDemoSection />
      <SectionDivider />
      <TradingEnvironmentSection />
      <SectionDivider />
      <PricingSection />
      <Footer />
    </main>
  );
};

export default Index;
