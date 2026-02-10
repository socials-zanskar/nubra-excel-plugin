import { motion } from "framer-motion";
import { Activity, BarChart3, ArrowRightLeft } from "lucide-react";
import UATGif from "@/assets/UAT.gif";
import PRODGif from "@/assets/PROD.gif";
import { GlassCard } from "@/components/ui/glass-card";

const features = [
  {
    icon: Activity,
    title: "Real-time Positions & PnL",
  },
  {
    icon: BarChart3,
    title: "Live Order Book & Market Data",
  },
  {
    icon: ArrowRightLeft,
    title: "Same APIs, Same UX — UAT to PROD",
  },
];

export const TradingEnvironmentSection = () => {
  return (
    <section className="relative w-full py-16 md:py-20 overflow-hidden">

      <div className="relative z-10 container mx-auto px-6 md:px-8">
        {/* Section Heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20 md:mb-28"
        >
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Trade, Test, and Build with a{" "}
            <span className="text-[#6E83FB]">Real UAT Environment</span>
          </h2>
          <p className="text-muted-foreground text-lg md:text-xl max-w-3xl mx-auto">
            Full featured UAT environment with a real trading dashboard
          </p>
        </motion.div>

        {/* 2-Column Grid for GIFs */}
        <div className="grid md:grid-cols-2 gap-8 md:gap-16 mb-20 md:mb-28">
          {/* UAT Environment */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex flex-col items-center group"
          >
            <h3 className="text-sm font-semibold text-[#6E83FB] uppercase tracking-wider mb-4 text-center transition-colors duration-300 group-hover:text-[#6E83FB]/90">
              UAT Trading
            </h3>
            <GlassCard hover className="relative overflow-hidden p-2 flex items-center justify-center w-[75%] transition-all duration-300 ease-out group-hover:-translate-y-1 group-hover:shadow-[0_16px_36px_hsl(245_82%_67%/0.18),0_6px_18px_hsl(0_0%_0%/0.45),0_0_22px_hsl(245_82%_67%/0.28)]">
              <img
                src={UATGif}
                alt="UAT Trading - Simulate live market conditions"
                className="w-full h-auto relative z-10 rounded"
              />
            </GlassCard>
            <p className="text-muted-foreground text-sm mt-5 text-center max-w-[75%]">
              Simulate live market conditions, place trades, and track positions in real time — without risking capital.
            </p>
          </motion.div>

          {/* Production Environment */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex flex-col items-center group"
          >
            <h3 className="text-sm font-semibold text-[#6E83FB] uppercase tracking-wider mb-4 text-center transition-colors duration-300 group-hover:text-[#6E83FB]/90">
              Live Trading
            </h3>
            <GlassCard hover className="relative overflow-hidden p-2 flex items-center justify-center w-[75%] transition-all duration-300 ease-out group-hover:-translate-y-1 group-hover:shadow-[0_16px_36px_hsl(245_82%_67%/0.18),0_6px_18px_hsl(0_0%_0%/0.45),0_0_22px_hsl(245_82%_67%/0.28)]">
              <img
                src={PRODGif}
                alt="Live Trading - Monitor real positions and P&L"
                className="w-full h-auto relative z-10 rounded"
              />
            </GlassCard>
            <p className="text-muted-foreground text-sm mt-5 text-center max-w-[75%]">
              Monitor real positions, P&L, margins, and orders seamlessly in production.
            </p>
          </motion.div>
        </div>

        {/* Feature Highlights - 3 Column Row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 mb-16 md:mb-20"
        >
          {features.map((feature, index) => (
            <GlassCard
              key={index}
              className="flex items-center justify-center gap-3 p-4"
            >
              <feature.icon className="w-5 h-5 text-primary flex-shrink-0" />
              <span className="text-foreground font-medium text-sm md:text-base">
                {feature.title}
              </span>
            </GlassCard>
          ))}
        </motion.div>

        {/* Callout Strip */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-center mb-12"
        >
          <p className="text-lg md:text-xl text-foreground/90 font-medium">
            Build once. Test in UAT. Deploy to production —{" "}
            <span className="text-[#6E83FB]">without changing your code.</span>
          </p>
        </motion.div>

      </div>
    </section>
  );
};
