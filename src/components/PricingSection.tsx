import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";

const features = [
  {
    title: "Low-Latency Trading APIs",
    description: "Smart order types for fast, reliable execution",
  },
  {
    title: "Institutional-Grade Market Data",
    description: "Real-time 20-level order book, Greeks, OHLCV, and options chain",
  },
  {
    title: "Deep Historical & Tick Data",
    description: "10 years of daily data + 1-second resolution data for recent markets",
  },
  {
    title: "Margin & Portfolio Intelligence",
    description: "Live margins, positions, holdings, and P&L via APIs",
  },
];

export const PricingSection = () => {
  return (
    <section id="pricing" className="relative w-full py-16 md:py-20 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[#6E83FB]/10 blur-[90px]" />
        <div className="absolute bottom-0 right-[-10%] h-64 w-64 rounded-full bg-[#59D3FF]/10 blur-[90px]" />
      </div>

      <div className="relative z-10 container mx-auto px-6 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-3">
            Unified <span className="text-[#6E83FB]">API Access</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            One plan that unlocks every Nubra API, from execution to market data
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="max-w-4xl mx-auto"
        >
          <GlassCard className="relative overflow-hidden p-8 md:p-10 ring-1 ring-[#6E83FB]/20 shadow-[0_10px_30px_hsl(245_82%_67%/0.15),0_4px_16px_hsl(0_0%_0%/0.35)] transition-all duration-300 ease-out hover:-translate-y-1 hover:ring-[#6E83FB]/35 hover:shadow-[0_18px_40px_hsl(245_82%_67%/0.18),0_6px_20px_hsl(0_0%_0%/0.45),0_0_24px_hsl(245_82%_67%/0.28)]">
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-[#6E83FB]/10 via-transparent to-[#59D3FF]/10" />
            <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
              <div className="md:max-w-lg">
                <div className="inline-flex items-center rounded-full border border-[#6E83FB]/40 bg-[#6E83FB]/15 px-3 py-1 text-xs font-semibold tracking-wide text-[#A9B6FF] shadow-[0_0_20px_hsl(232_92%_72%/0.25)]">
                  Single access tier
                </div>
                <h3 className="text-2xl md:text-3xl font-semibold text-foreground mt-4 mb-2">
                  Built for speed, reliability, and scale
                </h3>
                <p className="text-muted-foreground mb-6">
                  Develop and deploy trading systems across a unified API platform — no tiers, no minimums
                </p>
                <ul className="grid gap-4">
                  {features.map((feature) => (
                    <li key={feature.title} className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <div className="text-base font-semibold text-foreground">
                          {feature.title}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {feature.description}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="shrink-0 text-center md:text-right">
                <div className="text-5xl md:text-6xl font-bold text-foreground">
                  Rs <span className="text-[#6E83FB]">0</span>
                </div>
                <div className="text-sm text-muted-foreground mt-1">per month + taxes</div>
                <div className="text-xs text-muted-foreground/70 mt-3">
                  Terms and fair-use limits apply
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10"
        >
          <a
            href="/products/api/docs/"
            className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-foreground/90 transition-all hover:border-white/20 hover:bg-white/10"
          >
            Read documentation
          </a>
          <a
            href="https://nubra.io/"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_8px_24px_hsl(245_82%_67%/0.35)]"
            target="_blank"
            rel="noreferrer"
          >
            Get started
            <ArrowRight className="h-4 w-4" />
          </a>
        </motion.div>
      </div>
    </section>
  );
};
