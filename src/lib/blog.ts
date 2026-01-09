// Blog content types and utilities for folder-based markdown loading
// Uses virtual:blog-registry for auto-discovery of blog folders
import { blogSlugs } from 'virtual:blog-registry';

export interface BlogPost {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  readTime: string;
  publishDate: string;
  author: string;
  content: string;
  hasCustomStyles: boolean;
}

// const BASE_URL = import.meta.env.BASE_URL;
// const BLOGS_BASE_PATH = `${BASE_URL}content/blogs`;
const BASE_URL = import.meta.env.BASE_URL || '';
const BLOGS_BASE_PATH = `${BASE_URL.endsWith('/') ? BASE_URL : BASE_URL + '/'}content/blogs`;

// Browser-compatible frontmatter parser (no Node.js dependencies)
function parseFrontmatter(content: string): { data: Record<string, unknown>; content: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return { data: {}, content };
  }
  
  const frontmatterStr = match[1];
  const body = content.slice(match[0].length);
  
  const data: Record<string, unknown> = {};
  
  frontmatterStr.split('\n').forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();
      
      // Handle arrays (e.g., tags: ["a", "b"])
      if (value.startsWith('[') && value.endsWith(']')) {
        try {
          data[key] = JSON.parse(value);
        } catch {
          data[key] = value;
        }
      } else {
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        data[key] = value;
      }
    }
  });
  
  return { data, content: body };
}

// Get the base path for a blog's assets
function getBlogBasePath(slug: string): string {
  return `${BLOGS_BASE_PATH}/${slug}`;
}

// Transform relative asset paths in markdown to absolute paths
function transformAssetPaths(content: string, slug: string): string {
  const basePath = getBlogBasePath(slug);
  
  // Transform markdown image syntax: ![alt](./assets/image.png)
  let transformed = content.replace(
    /!\[([^\]]*)\]\(\.\/(assets\/[^)]+)\)/g,
    `![$1](${basePath}/$2)`
  );
  
  // Transform HTML img src: src="./assets/image.png"
  transformed = transformed.replace(
    /src=["']\.\/assets\/([^"']+)["']/g,
    `src="${basePath}/assets/$1"`
  );
  
  // Transform HTML video/source src: src="./assets/video.mp4"
  transformed = transformed.replace(
    /src=["']\.\/(assets\/[^"']+\.mp4)["']/gi,
    `src="${basePath}/$1"`
  );
  
  // Transform href for links to assets: href="./assets/file.pdf"
  transformed = transformed.replace(
    /href=["']\.\/(assets\/[^"']+)["']/g,
    `href="${basePath}/$1"`
  );
  
  return transformed;
}

// Check if a blog has custom styles
async function checkCustomStyles(slug: string): Promise<boolean> {
  try {
    const response = await fetch(`${getBlogBasePath(slug)}/styles.css`, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

// Fetch and parse a single blog post
async function fetchBlogContent(slug: string): Promise<BlogPost | null> {
  const path = `${getBlogBasePath(slug)}/index.md`;
  
  try {
    const [response, hasCustomStyles] = await Promise.all([
      fetch(path),
      checkCustomStyles(slug)
    ]);
    
    if (!response.ok) {
      console.error(`Failed to fetch blog: ${slug}`);
      return null;
    }
    
    const rawContent = await response.text();
    const { data: frontmatter, content } = parseFrontmatter(rawContent);
    
    // Transform relative asset paths to absolute paths
    const transformedContent = transformAssetPaths(content, slug);
    
    return {
      slug,
      title: (frontmatter.title as string) || slug,
      summary: (frontmatter.summary as string) || (frontmatter.description as string) || '',
      tags: (frontmatter.tags as string[]) || [],
      readTime: (frontmatter.readTime as string) || '5 min',
      publishDate: (frontmatter.publishDate as string) || (frontmatter.date as string) || new Date().toISOString().split('T')[0],
      author: (frontmatter.author as string) || 'Nubra Engineering',
      content: transformedContent.trim(),
      hasCustomStyles,
    };
  } catch (error) {
    console.error(`Error fetching blog ${slug}:`, error);
    return null;
  }
}

// Get all blog posts with metadata (auto-discovered from folders)
export async function getAllPosts(): Promise<BlogPost[]> {
  const results = await Promise.all(
    blogSlugs.map(slug => fetchBlogContent(slug))
  );
  
  return results
    .filter((post): post is BlogPost => post !== null)
    .sort((a, b) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime());
}

// Get a single post by slug with full content
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  if (!blogSlugs.includes(slug)) {
    return null;
  }
  return fetchBlogContent(slug);
}

// Get all unique tags from posts
export async function getAllTags(): Promise<string[]> {
  const posts = await getAllPosts();
  const allTags = new Set<string>();
  
  posts.forEach(post => {
    post.tags.forEach(tag => allTags.add(tag));
  });
  
  return Array.from(allTags).sort();
}

// Get posts filtered by tag
export async function getPostsByTag(tag: string): Promise<BlogPost[]> {
  const allPosts = await getAllPosts();
  return allPosts.filter(post => post.tags.includes(tag));
}

// Get the CSS URL for a blog's custom styles
export function getBlogStylesUrl(slug: string): string {
  return `${getBlogBasePath(slug)}/styles.css`;
}

// Export the discovered slugs for use elsewhere if needed
export { blogSlugs };
