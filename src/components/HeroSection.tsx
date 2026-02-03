import { useState, useCallback, useEffect } from "react";
import { APIAsset } from "./APIAsset";
import { APIInfo } from "./InfoCard";

import PythonRESTBG from "@/assets/PythonRESTBG.png";
import NubraLogoBG from "@/assets/NubraLogoBG.png";
import TradingAPIBG from "@/assets/TradingAPIBG.png";
import MarketDataAPIBG from "@/assets/MarketDataAPIBG.png";
import PortfolioAPIBG from "@/assets/PortfolioAPIBG.png";

const apiData: Record<string, APIInfo> = {
  nubraLogo: {
    id: "nubraLogo",
    title: "",
    bullets: [
      "Nubra APIs are powered by HFT-grade infrastructure, bringing institutional-level features and performance to retail and professional traders",
    ],
    cta: "",
    ctaLink: "",
  },
  pythonRest: {
    id: "pythonRest",
    title: "Python/REST",
    bullets: [
      "Low-level REST APIs for direct system integration",
      "Python SDKs for beginner-to-expert workflows",
    ],
    cta: "View Docs",
    ctaLink: "/products/api/docs/",
  },
  marketData: {
    id: "marketData",
    title: "Market Data APIs",
    bullets: [
      "Snapshot data for Order Book and Option Chain",
      "Historical data including Expired Options",
      "Real-time 20-level Order Book and OHLCV",
      "Real-time Option Chain and Greeks",
    ],
    cta: "View Docs",
    ctaLink: "/products/api/docs/",
  },
  trading: {
    id: "trading",
    title: "Trading APIs",
    bullets: [
      "Place individual or basket orders",
      "Build complex F&O strategies using flexi baskets",
      "Get accurate margin estimates with hedge benefits",
      "Place, modify, and cancel orders seamlessly",
    ],
    cta: "View Docs",
    ctaLink: "/products/api/docs/",
  },
  portfolio: {
    id: "portfolio",
    title: "Portfolio APIs",
    bullets: [
      "Real-time PnL tracking",
      "Real-time live cash, margin, and collateral",
      "Detailed position, PnL, margin benefit, and more",
    ],
    cta: "View Docs",
    ctaLink: "/products/api/docs/",
  },
};

export const HeroSection = () => {
  const [activeAsset, setActiveAsset] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (hasScrolled) {
      return;
    }
    const handleScroll = () => setHasScrolled(true);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [hasScrolled]);

  const handleActivate = useCallback((id: string) => {
    setActiveAsset(id);
  }, []);

  const handleDeactivate = useCallback(() => {
    setActiveAsset(null);
  }, []);

  const handleScrollActivate = useCallback(
    (id: string) => {
      if (activeAsset === id) {
        return;
      }
      setActiveAsset(id);
    },
    [activeAsset]
  );

  const handleOutsideClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[role="button"]') === null) {
      setActiveAsset(null);
    }
  }, []);

  if (isMobile) {
    return (
      <section 
        className="relative min-h-screen pt-24 pb-12 px-4 overflow-hidden"
        onClick={handleOutsideClick}
      >

        <div className="relative z-10 flex flex-col items-center">
          {/* Hero Text */}
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Nubra <span className="text-[#6E83FB]">APIs</span>
            </h1>
            <p className="text-muted-foreground text-sm mb-2">
              Powerful trading infrastructure for developers
            </p>
            <p className="text-muted-foreground/60 text-xs max-w-xs mx-auto">
              Build, automate, and scale trading systems with institutional-grade APIs
            </p>
          </div>

          {/* Stacked Assets */}
          <div className="flex flex-col items-center gap-10 w-full max-w-xs">
            {/* Python REST */}
            <div className="flex flex-col items-center">
              <span className={`text-[10px] font-medium mb-2 transition-opacity duration-150 ${
                activeAsset === "pythonRest" ? "text-muted-foreground" : "text-muted-foreground/50"
              }`}>
                Python/REST
              </span>
              <APIAsset
                image={PythonRESTBG}
                alt="Python REST APIs"
                info={apiData.pythonRest}
                position="center"
                isActive={activeAsset === "pythonRest"}
                onActivate={() => handleActivate("pythonRest")}
                onDeactivate={handleDeactivate}
                hasActiveAsset={activeAsset !== null}
                enableScrollActivation={hasScrolled}
                onScrollActivate={handleScrollActivate}
                className="w-full max-w-[180px]"
              />
            </div>

            {/* Trading */}
            <div className="flex flex-col items-center">
              <span className={`text-[10px] font-medium mb-2 transition-opacity duration-150 ${
                activeAsset === "trading" ? "text-muted-foreground" : "text-muted-foreground/50"
              }`}>
                Trading APIs
              </span>
              <APIAsset
                image={TradingAPIBG}
                alt="Trading APIs"
                info={apiData.trading}
                position="center"
                isActive={activeAsset === "trading"}
                onActivate={() => handleActivate("trading")}
                onDeactivate={handleDeactivate}
                hasActiveAsset={activeAsset !== null}
                enableScrollActivation={hasScrolled}
                onScrollActivate={handleScrollActivate}
                className="w-full max-w-[200px]"
              />
            </div>

            {/* Market Data */}
            <div className="flex flex-col items-center">
              <span className={`text-[10px] font-medium mb-2 transition-opacity duration-150 ${
                activeAsset === "marketData" ? "text-muted-foreground" : "text-muted-foreground/50"
              }`}>
                Market Data APIs
              </span>
              <APIAsset
                image={MarketDataAPIBG}
                alt="Market Data APIs"
                info={apiData.marketData}
                position="center"
                isActive={activeAsset === "marketData"}
                onActivate={() => handleActivate("marketData")}
                onDeactivate={handleDeactivate}
                hasActiveAsset={activeAsset !== null}
                enableScrollActivation={hasScrolled}
                onScrollActivate={handleScrollActivate}
                className="w-full max-w-[200px]"
              />
            </div>

            {/* Portfolio */}
            <div className="flex flex-col items-center">
              <span className={`text-[10px] font-medium mb-2 transition-opacity duration-150 ${
                activeAsset === "portfolio" ? "text-muted-foreground" : "text-muted-foreground/50"
              }`}>
                Portfolio APIs
              </span>
              <APIAsset
                image={PortfolioAPIBG}
                alt="Portfolio APIs"
                info={apiData.portfolio}
                position="center"
                isActive={activeAsset === "portfolio"}
                onActivate={() => handleActivate("portfolio")}
                onDeactivate={handleDeactivate}
                hasActiveAsset={activeAsset !== null}
                enableScrollActivation={hasScrolled}
                onScrollActivate={handleScrollActivate}
                className="w-full max-w-[220px]"
              />
            </div>

            {/* Nubra Logo */}
            <div className="mt-4">
              <APIAsset
                image={NubraLogoBG}
                alt="Nubra Logo"
                info={apiData.nubraLogo}
                position="top"
                isActive={activeAsset === "nubraLogo"}
                onActivate={() => handleActivate("nubraLogo")}
                onDeactivate={handleDeactivate}
                hasActiveAsset={activeAsset !== null}
                isLogo={true}
                enableScrollActivation={hasScrolled}
                onScrollActivate={handleScrollActivate}
                className="w-[80px]"
              />
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section 
      className="relative min-h-screen flex flex-col items-center justify-center pt-32 pb-20"
      onClick={handleOutsideClick}
    >

      {/* Main content container */}
      <div className="relative z-10 w-full max-w-5xl mx-auto px-6">
        {/* Hero Text */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-3 tracking-tight">
            Nubra <span className="text-[#6E83FB]">APIs</span>
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mb-2">
            Powerful trading infrastructure for developers
          </p>
          <p className="text-xs md:text-sm text-muted-foreground/50 max-w-md mx-auto">
            Build, automate, and scale trading systems with institutional-grade APIs
          </p>
        </div>

        {/* Portfolio API - centered above, secondary */}
        <div className="flex flex-col items-center mb-6">
          <span 
            className={`text-[10px] font-medium mb-2 transition-opacity duration-150 ease-out ${
              activeAsset === "portfolio" ? "text-muted-foreground" : "text-muted-foreground/50"
            } ${activeAsset && activeAsset !== "portfolio" ? "opacity-40" : ""}`}
          >
            Portfolio APIs
          </span>
          <APIAsset
            image={PortfolioAPIBG}
            alt="Portfolio APIs"
            info={apiData.portfolio}
            position="back"
            isActive={activeAsset === "portfolio"}
            onActivate={() => handleActivate("portfolio")}
            onDeactivate={handleDeactivate}
            hasActiveAsset={activeAsset !== null}
            enableScrollActivation={hasScrolled}
            onScrollActivate={handleScrollActivate}
            className="w-[195px] md:w-[235px] lg:w-[275px] opacity-60"
          />
        </div>

        {/* API Belt - Horizontal axis */}
        <div className="relative flex items-center justify-center gap-8 md:gap-12 lg:gap-16">
          {/* Left - Trading API */}
          <div className="flex flex-col items-center flex-shrink-0">
            <span 
              className={`text-[10px] font-medium mb-2 transition-opacity duration-150 ease-out ${
                activeAsset === "trading" ? "text-muted-foreground" : "text-muted-foreground/50"
              } ${activeAsset && activeAsset !== "trading" ? "opacity-40" : ""}`}
            >
              Trading APIs
            </span>
            <APIAsset
              image={TradingAPIBG}
              alt="Trading APIs"
              info={apiData.trading}
              position="left"
              isActive={activeAsset === "trading"}
              onActivate={() => handleActivate("trading")}
              onDeactivate={handleDeactivate}
              hasActiveAsset={activeAsset !== null}
              enableScrollActivation={hasScrolled}
              onScrollActivate={handleScrollActivate}
              className="w-[240px] md:w-[300px] lg:w-[360px]"
            />
          </div>

          {/* Center - Python REST */}
          <div className="flex flex-col items-center flex-shrink-0">
            <span 
              className={`text-[10px] font-medium mb-2 transition-opacity duration-150 ease-out ${
                activeAsset === "pythonRest" ? "text-muted-foreground" : "text-muted-foreground/50"
              } ${activeAsset && activeAsset !== "pythonRest" ? "opacity-40" : ""}`}
            >
              Python/REST
            </span>
            <APIAsset
              image={PythonRESTBG}
              alt="Python REST APIs"
              info={apiData.pythonRest}
              position="center"
              isActive={activeAsset === "pythonRest"}
              onActivate={() => handleActivate("pythonRest")}
              onDeactivate={handleDeactivate}
              hasActiveAsset={activeAsset !== null}
              enableScrollActivation={hasScrolled}
              onScrollActivate={handleScrollActivate}
              className="w-[180px] md:w-[225px] lg:w-[255px]"
            />
          </div>

          {/* Right - Market Data API */}
          <div className="flex flex-col items-center flex-shrink-0">
            <span 
              className={`text-[10px] font-medium mb-2 transition-opacity duration-150 ease-out ${
                activeAsset === "marketData" ? "text-muted-foreground" : "text-muted-foreground/50"
              } ${activeAsset && activeAsset !== "marketData" ? "opacity-40" : ""}`}
            >
              Market Data APIs
            </span>
            <APIAsset
              image={MarketDataAPIBG}
              alt="Market Data APIs"
              info={apiData.marketData}
              position="right"
              isActive={activeAsset === "marketData"}
              onActivate={() => handleActivate("marketData")}
              onDeactivate={handleDeactivate}
              hasActiveAsset={activeAsset !== null}
              enableScrollActivation={hasScrolled}
              onScrollActivate={handleScrollActivate}
              className="w-[240px] md:w-[300px] lg:w-[360px]"
            />
          </div>
        </div>

        {/* Nubra Logo - Foundation layer, 2x size */}
        <div className="flex justify-center mt-10">
          <APIAsset
            image={NubraLogoBG}
            alt="Nubra Logo"
            info={apiData.nubraLogo}
            position="top"
            isActive={activeAsset === "nubraLogo"}
            onActivate={() => handleActivate("nubraLogo")}
            onDeactivate={handleDeactivate}
            hasActiveAsset={activeAsset !== null}
            isLogo={true}
            enableScrollActivation={hasScrolled}
            onScrollActivate={handleScrollActivate}
            className="w-[231px] md:w-[273px] lg:w-[315px]"
          />
        </div>
      </div>
    </section>
  );
};
