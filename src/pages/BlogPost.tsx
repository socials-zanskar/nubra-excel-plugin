import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Calendar, Clock, User } from "lucide-react";
import { NavBar } from "@/components/NavBar";
import { MarkdownRenderer } from "@/components/blog/MarkdownRenderer";
import { BlogCard } from "@/components/blog/BlogCard";
import { getPostBySlug, getAllPosts, getBlogStylesUrl, type BlogPost } from "@/lib/blog";

const BlogPostPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [relatedPosts, setRelatedPosts] = useState<BlogPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Load blog post
  useEffect(() => {
    async function loadPost() {
      if (!slug) return;
      
      setIsLoading(true);
      const [fetchedPost, allPosts] = await Promise.all([
        getPostBySlug(slug),
        getAllPosts(),
      ]);

      if (!fetchedPost) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }

      setPost(fetchedPost);

      // Get related posts (same tags, excluding current)
      const related = allPosts
        .filter((p) => p.slug !== slug)
        .filter((p) => p.tags.some((tag) => fetchedPost.tags.includes(tag)))
        .slice(0, 2);
      setRelatedPosts(related);

      setIsLoading(false);
    }
    loadPost();
  }, [slug]);

  // Inject per-blog CSS when blog has custom styles
  useEffect(() => {
    if (!post?.hasCustomStyles || !slug) return;

    const styleId = `blog-styles-${slug}`;
    
    // Don't add if already exists
    if (document.getElementById(styleId)) return;

    const link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.href = getBlogStylesUrl(slug);
    document.head.appendChild(link);

    // Cleanup: remove stylesheet when navigating away
    return () => {
      const existingLink = document.getElementById(styleId);
      if (existingLink) {
        existingLink.remove();
      }
    };
  }, [post?.hasCustomStyles, slug]);

  const formattedDate = post
    ? new Date(post.publishDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background usecase-font">
        <NavBar />
        <div className="container mx-auto px-4 pt-32">
          <div className="max-w-3xl mx-auto">
            <div className="h-8 w-32 bg-card/50 rounded animate-pulse mb-8" />
            <div className="h-12 w-3/4 bg-card/50 rounded animate-pulse mb-4" />
            <div className="h-6 w-1/2 bg-card/50 rounded animate-pulse mb-8" />
            <div className="space-y-4">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="h-4 bg-card/30 rounded animate-pulse"
                  style={{ width: `${Math.random() * 40 + 60}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-background usecase-font">
        <NavBar />
        <div className="container mx-auto px-4 pt-32 text-center">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            Post Not Found
          </h1>
          <p className="text-muted-foreground mb-8">
            The blog post you're looking for doesn't exist.
          </p>
          <Link
            to="/blogs"
            className="inline-flex items-center gap-2 text-primary hover:text-primary/80 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Blogs
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background usecase-font">
      <NavBar />

      {/* Article Header */}
      <header className="relative pt-24 pb-2 md:pt-28 md:pb-4 overflow-hidden">
        {/* Ambient background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/3 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        </div>

        <div className="relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-5xl px-6 md:px-8"
          >
            {/* Back link */}
            <Link
              to="/blogs"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Blogs
            </Link>

            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-4">
              {post?.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary/80 border border-primary/20"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Title */}
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6 leading-tight">
              {post?.title}
            </h1>

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <User className="w-4 h-4" />
                {post?.author}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {formattedDate}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {post?.readTime}
              </span>
            </div>
          </motion.div>
        </div>
      </header>

      {/* Article Content */}
      <article className="pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="
            mx-auto 
            max-w-5xl 
            px-6 
            md:px-8 
            blog-content
          "
        >
          {post && <MarkdownRenderer content={post.content} />}
        </motion.div>
      </article>


      {/* Related Posts */}
      {relatedPosts.length > 0 && (
        <section className="pb-20 border-t border-border/40">
          <div className="container mx-auto px-4 pt-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="max-w-5xl mx-auto"
            >
              <h2 className="text-2xl font-bold text-foreground mb-8">
                Related Posts
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {relatedPosts.map((relatedPost, index) => (
                  <BlogCard
                    key={relatedPost.slug}
                    post={relatedPost}
                    index={index}
                  />
                ))}
              </div>
            </motion.div>
          </div>
        </section>
      )}
    </div>
  );
};

export default BlogPostPage;
