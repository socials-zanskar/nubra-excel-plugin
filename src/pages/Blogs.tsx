import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { NavBar } from "@/components/NavBar";
import { BlogCard } from "@/components/blog/BlogCard";
import { TagFilter } from "@/components/blog/TagFilter";
import { getAllPosts, getAllTags, type BlogPost } from "@/lib/blog";

const Blogs = () => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadContent() {
      const [allPosts, allTags] = await Promise.all([
        getAllPosts(),
        getAllTags(),
      ]);
      setPosts(allPosts);
      setTags(allTags);
      setIsLoading(false);
    }
    loadContent();
  }, []);

  const filteredPosts = selectedTag
    ? posts.filter((post) => post.tags.includes(selectedTag))
    : posts;

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

      {/* Hero Section */}
      <section className="relative pt-24 pb-6 md:pt-32 md:pb-8 overflow-hidden">
        {/* Ambient background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-primary/3 rounded-full blur-3xl" />
        </div>

        <div className="relative container mx-auto px-6 md:px-12 lg:px-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl"
          >
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-4">
              Engineering Blogs
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl">
              Technical deep dives from the Nubra engineering team. Infrastructure, performance, and the craft of building reliable trading systems.
            </p>
          </motion.div>

          {/* Tag Filter */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="mt-8"
          >
            <TagFilter
              tags={tags}
              selectedTag={selectedTag}
              onTagSelect={setSelectedTag}
            />
          </motion.div>
        </div>
      </section>

      {/* Blog Grid */}
      <section className="pb-20">
        <div className="mx-auto max-w-6xl px-6 md:px-8">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="h-64 rounded-xl bg-card/30 animate-pulse border border-border/20"
                />
              ))}
            </div>
          ) : filteredPosts.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16"
            >
              <p className="text-muted-foreground text-lg">
                No posts found for "{selectedTag}".
              </p>
              <button
                onClick={() => setSelectedTag(null)}
                className="mt-4 text-primary hover:text-primary/80 underline underline-offset-4"
              >
                Clear filter
              </button>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPosts.map((post, index) => (
                <BlogCard key={post.slug} post={post} index={index} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default Blogs;
