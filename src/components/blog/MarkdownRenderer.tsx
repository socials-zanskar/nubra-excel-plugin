import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface MarkdownRendererProps {
  content: string;
}

// Generate anchor ID from heading text
function generateAnchorId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

export const MarkdownRenderer = ({ content }: MarkdownRendererProps) => {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const activateGroup = (group: Element, target: string) => {
      if (!target) return;
      const source = group.querySelector<HTMLTextAreaElement>(
        `[data-broker-code="${target}"]`
      );
      const output = group.querySelector<HTMLElement>("[data-broker-output]");
      if (!source || !output) return;

      const buttons = group.querySelectorAll<HTMLElement>("[data-broker-target]");
      buttons.forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.brokerTarget === target);
      });

      output.textContent = (source.value || source.textContent || "").trim();
    };

    const handleClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLElement>("[data-broker-target]");
      if (!button || !root.contains(button)) return;
      const group = button.closest(".broker-toggle");
      if (!group) return;
      activateGroup(group, button.dataset.brokerTarget || "");
    };

    const handleKeyDown = (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key !== "Enter" && keyboardEvent.key !== " ") return;
      const target = keyboardEvent.target as HTMLElement | null;
      const button = target?.closest<HTMLElement>("[data-broker-target]");
      if (!button || !root.contains(button)) return;
      const group = button.closest(".broker-toggle");
      if (!group) return;
      keyboardEvent.preventDefault();
      activateGroup(group, button.dataset.brokerTarget || "");
    };

    const groups = root.querySelectorAll(".broker-toggle");
    groups.forEach((group) => {
      const defaultButton =
        group.querySelector<HTMLElement>(".logo-button.is-active") ||
        group.querySelector<HTMLElement>("[data-broker-target]");
      if (defaultButton) {
        activateGroup(group, defaultButton.dataset.brokerTarget || "");
      }
    });

    root.addEventListener("click", handleClick);
    root.addEventListener("keydown", handleKeyDown);

    return () => {
      root.removeEventListener("click", handleClick);
      root.removeEventListener("keydown", handleKeyDown);
    };
  }, [content]);

  return (
    <div className="prose prose-invert prose-lg max-w-none" ref={rootRef}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          // Headings with anchor links
          h1: ({ children }) => {
            const text = String(children);
            const id = generateAnchorId(text);
            return (
              <h1 id={id} className="group text-3xl md:text-4xl font-bold text-foreground mt-8 mb-6 first:mt-0 scroll-mt-24">
                <a href={`#${id}`} className="no-underline hover:no-underline">
                  {children}
                  <span className="ml-2 opacity-0 group-hover:opacity-50 transition-opacity text-muted-foreground">#</span>
                </a>
              </h1>
            );
          },
          h2: ({ children }) => {
            const text = String(children);
            const id = generateAnchorId(text);
            return (
              <h2 id={id} className="group text-2xl md:text-3xl font-semibold text-foreground mt-10 mb-4 pb-2 border-b border-border/40 scroll-mt-24">
                <a href={`#${id}`} className="no-underline hover:no-underline">
                  {children}
                  <span className="ml-2 opacity-0 group-hover:opacity-50 transition-opacity text-muted-foreground">#</span>
                </a>
              </h2>
            );
          },
          h3: ({ children }) => {
            const text = String(children);
            const id = generateAnchorId(text);
            return (
              <h3 id={id} className="group text-xl md:text-2xl font-semibold text-foreground mt-8 mb-3 scroll-mt-24">
                <a href={`#${id}`} className="no-underline hover:no-underline">
                  {children}
                  <span className="ml-2 opacity-0 group-hover:opacity-50 transition-opacity text-muted-foreground">#</span>
                </a>
              </h3>
            );
          },
          h4: ({ children }) => {
            const text = String(children);
            const id = generateAnchorId(text);
            return (
              <h4 id={id} className="group text-lg font-semibold text-foreground mt-6 mb-2 scroll-mt-24">
                <a href={`#${id}`} className="no-underline hover:no-underline">
                  {children}
                  <span className="ml-2 opacity-0 group-hover:opacity-50 transition-opacity text-muted-foreground">#</span>
                </a>
              </h4>
            );
          },
          
          // Paragraphs
          p: ({ children }) => (
            <p className="text-muted-foreground leading-relaxed mb-4">
              {children}
            </p>
          ),
          
          // Lists
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-2 mb-4 text-muted-foreground">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-2 mb-4 text-muted-foreground">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-muted-foreground">
              {children}
            </li>
          ),
          
          // Strong and emphasis
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-muted-foreground">
              {children}
            </em>
          ),
          
          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-[#6E83FB] hover:text-[#6E83FB]/80 underline underline-offset-4 transition-colors"
              target={href?.startsWith('http') ? '_blank' : undefined}
              rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
            >
              {children}
            </a>
          ),
          
          // Images - supports png, jpg, gif
          img: ({ src, alt }) => (
            <figure className="my-6">
              <img 
                src={src} 
                alt={alt || ''} 
                className="rounded-lg border border-border/40 max-w-full h-auto"
                loading="lazy"
              />
              {alt && <figcaption className="text-sm text-muted-foreground mt-2 text-center">{alt}</figcaption>}
            </figure>
          ),
          
          // Video elements for mp4 support
          video: ({ src, ...props }) => (
            <figure className="my-6">
              <video 
                src={src}
                className="rounded-lg border border-border/40 max-w-full h-auto"
                controls
                {...props}
              />
            </figure>
          ),
          
          // Inline code
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match;
            
            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded bg-secondary/60 text-primary font-mono text-sm"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            
            return (
              <SyntaxHighlighter
                style={oneDark}
                language={match[1]}
                PreTag="div"
                customStyle={{
                  margin: 0,
                  borderRadius: '0.75rem',
                  fontSize: '0.625rem',
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border) / 0.4)',
                }}
                codeTagProps={{
                  style: {
                    fontFamily: 'var(--font-mono)',
                  }
                }}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            );
          },
          
          // Code blocks wrapper
          pre: ({ children }) => (
            <div className="my-6 overflow-hidden rounded-xl">
              {children}
            </div>
          ),
          
          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/40 pl-4 my-6 italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          
          // Horizontal rule
          hr: () => (
            <hr className="my-8 border-border/40" />
          ),
          
          // Tables
          table: ({ children }) => (
            <div className="my-6 overflow-x-auto">
              <table className="w-full border-collapse border border-border/40 rounded-lg overflow-hidden">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-secondary/40">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-4 py-3 text-left text-sm font-semibold text-foreground border-b border-border/40">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-3 text-sm text-muted-foreground border-b border-border/20">
              {children}
            </td>
          ),
          
          // Handle raw HTML div elements (for custom layouts in markdown)
          div: ({ className, children, style, ...props }) => {
            return (
              <div className={className} style={style} {...props}>
                {children}
              </div>
            );
          },

          // Figure elements
          figure: ({ children, className }) => (
            <figure className={`my-6 ${className || ''}`}>
              {children}
            </figure>
          ),
          
          // Figcaption
          figcaption: ({ children }) => (
            <figcaption className="text-sm text-muted-foreground mt-2 text-center">
              {children}
            </figcaption>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
