import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Calendar, Clock, ArrowRight } from "lucide-react";
import type { UseCasePost } from "@/lib/usecase";
import { GlassCard } from "@/components/ui/glass-card";

interface UseCaseCardProps {
  post: UseCasePost;
  index: number;
}

export const UseCaseCard = ({ post, index }: UseCaseCardProps) => {
  const formattedDate = new Date(post.publishDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.4 }}
    >
      <Link to={`/use-cases/${post.slug}`} className="block group">
        <GlassCard hover className="relative overflow-hidden p-6">
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />
          </div>

          <div className="relative z-10">
            <div className="mb-4 overflow-hidden rounded-lg border border-border/30 bg-muted/20">
              {post.image ? (
                <img
                  src={post.image}
                  alt={post.title}
                  className="h-44 w-full object-cover object-center"
                  loading="lazy"
                />
              ) : (
                <div className="h-44 w-full bg-gradient-to-br from-muted/30 via-muted/10 to-transparent" />
              )}
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-[#586fed]/20 text-white border border-[#F5F5FF]/40"
                >
                  {tag}
                </span>
              ))}
            </div>

            <h3 className="text-xl font-semibold text-foreground mb-3 transition-colors line-clamp-2">
              {post.title}
            </h3>

            <p className="text-muted-foreground text-sm leading-relaxed mb-4 line-clamp-2">
              {post.summary}
            </p>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {formattedDate}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {post.readTime}
                </span>
              </div>

              <span className="flex items-center gap-1 text-xs text-[#6E83FB] group-hover:text-[#6E83FB] transition-colors">
                Read
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </div>
          </div>
        </GlassCard>
      </Link>
    </motion.article>
  );
};
