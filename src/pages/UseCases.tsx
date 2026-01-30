import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { NavBar } from "@/components/NavBar";
import { UseCaseCard } from "@/components/usecase/UseCaseCard";
import { getAllUseCases, type UseCasePost } from "@/lib/usecase";

const UseCases = () => {
  const [posts, setPosts] = useState<UseCasePost[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadContent() {
      const allPosts = await getAllUseCases();
      setPosts(allPosts);
      setIsLoading(false);
    }
    loadContent();
  }, []);


  return (
    <div
      className="min-h-screen bg-background usecase-font"
      style={{
        backgroundImage: "url('/images/bg-2.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }}
    >
      <NavBar />

      <section className="relative pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-primary/3 rounded-full blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 md:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-10 lg:gap-16">
            <div className="self-start flex lg:flex-col lg:justify-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-4 leading-tight">
                  Use Case
                  <br />
                  Library
                </h1>
                <p className="text-lg md:text-xl text-muted-foreground">
                  How to use Nubra Market Data APIs to build Screeners and Tools for Interactive Dashboards
                </p>
              </motion.div>

            </div>

            <div className="flex flex-col gap-6">
          {isLoading ? (
            <>
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-64 rounded-xl bg-card/30 animate-pulse border border-border/20"
                />
              ))}
            </>
          ) : posts.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16"
            >
              <p className="text-muted-foreground text-lg">
                No use cases found.
              </p>
            </motion.div>
          ) : (
            posts.map((post, index) => (
              <UseCaseCard key={post.slug} post={post} index={index} />
            ))
          )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default UseCases;
