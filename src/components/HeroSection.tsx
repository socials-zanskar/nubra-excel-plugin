import { useState, useEffect } from "react";

import MarketDataAPIBG from "@/assets/MarketDataAPIBG.png";
import PortfolioAPIBG from "@/assets/PortfolioAPIBG.png";
import TradingAPIBG from "@/assets/TradingAPIBG.png";

export const HeroSection = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [activeHeroImage, setActiveHeroImage] = useState(0);

  const heroImages = [
    {
      src: MarketDataAPIBG,
      alt: "Market Data API",
      caption: [
        "20-level order book and option chain",
        "Historical equities, futures, and options data",
        "10,000+ instrument subscriptions"
      ]
    },
    {
      src: PortfolioAPIBG,
      alt: "Portfolio API",
      caption: [
        "Real-time holdings with PnL and margin",
        "Positions with realised and unrealised PnL",
        "Live funds and margin overview"
      ]
    },
    {
      src: TradingAPIBG,
      alt: "Trading API",
      caption: [
        "Single, multi, and F&O order APIs",
        "Margin checks for position sizing",
        "Modify and cancel orders seamlessly"
      ]
    }
  ];

  const showPrev = () =>
    setActiveHeroImage((prev) => (prev - 1 + heroImages.length) % heroImages.length);
  const showNext = () =>
    setActiveHeroImage((prev) => (prev + 1) % heroImages.length);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  if (isMobile) {
    return (
      <section 
        className="relative min-h-screen pt-24 pb-12 px-4 overflow-hidden"
      >

        <div className="relative z-10 flex flex-col items-center text-center">
          {/* Hero Text */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-3">
              Nubra <span className="text-[#6E83FB]">APIs</span>
            </h1>
            <p className="text-base font-semibold text-foreground mb-3 drop-shadow-[0_8px_24px_rgba(110,131,251,0.25)]">
              Powering <span className="text-[#6E83FB]">Serious</span> Trading Infrastructure
            </p>
            <p className="text-sm text-muted-foreground">
              Low‑latency trading, institutional market data, and reliable execution APIs.
            </p>
          </div>

          {/* CTAs */}
          <div className="flex flex-col gap-3 w-full max-w-xs">
              <a
                href="https://nubra.io/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[0_12px_30px_hsl(245_82%_67%/0.35)]"
              >
                Start building
              </a>
              <a
                href="/products/api/docs/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-foreground/90"
              >
                View documentation
              </a>
          </div>

          {/* Stats */}
          <div className="mt-8 w-full max-w-xs text-left">
            <div className="flex flex-col gap-3 text-sm text-foreground/90">
              <div className="flex flex-col gap-1">
                <span className="font-semibold">5,000+ instruments</span>
                <span className="text-xs text-muted-foreground">Realtime stream</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-semibold">&lt;20ms</span>
                <span className="text-xs text-muted-foreground">Order latency</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-semibold">Free access</span>
                <span className="text-xs text-muted-foreground">Trading + market data APIs</span>
              </div>
            </div>
            <div className="mt-3 text-[11px] uppercase tracking-[0.24em] text-muted-foreground/70">
              And more capabilities built in
            </div>
          </div>

          {/* Visual */}
          <div className="mt-8 flex justify-center">
            <div className="relative w-[240px]">
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground/70">
                {heroImages[activeHeroImage].alt}
              </div>
              <button
                type="button"
                onClick={showPrev}
                aria-label="Previous image"
                className="absolute -left-8 top-1/2 -translate-y-1/2 h-9 w-9 text-white/80 transition-colors hover:text-white"
              >
                <svg viewBox="0 0 24 24" className="mx-auto h-7 w-7">
                  <path d="M15.5 6.5l-7 5.5 7 5.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                onClick={showNext}
                aria-label="Next image"
                className="absolute -right-8 top-1/2 -translate-y-1/2 h-9 w-9 text-white/80 transition-colors hover:text-white"
              >
                <svg viewBox="0 0 24 24" className="mx-auto h-7 w-7">
                  <path d="M8.5 6.5l7 5.5-7 5.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <img
                src={heroImages[activeHeroImage].src}
                alt={heroImages[activeHeroImage].alt}
                className="w-[220px] object-contain drop-shadow-[0_18px_40px_hsl(225_40%_45%/0.35)]"
                draggable={false}
              />
              {heroImages[activeHeroImage].caption && (
                <div className="mt-3 text-center text-[11px] leading-[1.35] text-muted-foreground/75">
                  {heroImages[activeHeroImage].caption?.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section 
      className="relative min-h-screen flex items-center pt-32 pb-20"
    >

      {/* Main content container */}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-6">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] items-center">
          {/* Hero Text */}
          <div>
            <h1 className="w-full text-center text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-3 tracking-tight translate-x-1/2">
              Nubra <span className="text-[#6E83FB]">APIs</span>
            </h1>
            <p className="text-lg md:text-xl font-semibold text-foreground mb-4 drop-shadow-[0_10px_28px_rgba(110,131,251,0.25)] text-center translate-x-1/2">
              Powering <span className="text-[#6E83FB]">Serious</span> Trading Infrastructure
            </p>
            <div className="text-base md:text-lg text-muted-foreground max-w-xl space-y-2 translate-y-[35%]">
              <p>
                Connect to low‑latency execution, institutional market data, and robust
                portfolio systems
              </p>
            </div>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap gap-4 translate-y-[35%]">
              <a
                href="https://nubra.io/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground shadow-[0_14px_36px_hsl(245_82%_67%/0.35)]"
              >
                Start building
              </a>
              <a
                href="/products/api/docs/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-7 py-3 text-sm font-semibold text-foreground/90"
              >
                View documentation
              </a>
            </div>

            {/* Stats */}
            <div className="mt-6 max-w-xl translate-y-[35%]">
              <div className="flex flex-col gap-4 text-base text-foreground/90">
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">5,000+ instruments</span>
                  <span className="text-sm text-muted-foreground">Realtime stream</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">&lt;20ms</span>
                  <span className="text-sm text-muted-foreground">Order latency</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">Free access</span>
                  <span className="text-sm text-muted-foreground">Trading + market data APIs</span>
                </div>
              </div>
              <div className="mt-4 text-xs uppercase tracking-[0.24em] text-muted-foreground/70">
                And more capabilities built in
              </div>
            </div>
          </div>

          {/* Hero Visual */}
          <div className="relative flex justify-center lg:justify-end translate-y-[35%]">
            <div className="absolute -top-8 right-6 h-40 w-40 rounded-full bg-[#6E83FB]/15 blur-[70px]" />
            <div className="absolute -bottom-10 right-0 h-48 w-48 rounded-full bg-[#59D3FF]/10 blur-[80px]" />
            <div className="relative">
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs uppercase tracking-[0.24em] text-muted-foreground/70">
                {heroImages[activeHeroImage].alt}
              </div>
              <button
                type="button"
                onClick={showPrev}
                aria-label="Previous image"
                className="absolute -left-10 top-1/2 -translate-y-1/2 h-10 w-10 text-white/80 transition-colors hover:text-white"
              >
                <svg viewBox="0 0 24 24" className="mx-auto h-8 w-8">
                  <path d="M15.5 6.5l-7 5.5 7 5.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                onClick={showNext}
                aria-label="Next image"
                className="absolute -right-10 top-1/2 -translate-y-1/2 h-10 w-10 text-white/80 transition-colors hover:text-white"
              >
                <svg viewBox="0 0 24 24" className="mx-auto h-8 w-8">
                  <path d="M8.5 6.5l7 5.5-7 5.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <img
                src={heroImages[activeHeroImage].src}
                alt={heroImages[activeHeroImage].alt}
                className="w-[280px] md:w-[340px] lg:w-[420px] object-contain drop-shadow-[0_24px_60px_hsl(225_40%_45%/0.45)]"
                draggable={false}
              />
              {heroImages[activeHeroImage].caption && (
                <div className="mt-4 text-center text-xs leading-[1.4] text-muted-foreground/75">
                  {heroImages[activeHeroImage].caption?.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
