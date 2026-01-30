import { useCaseSlugs } from 'virtual:usecase-registry';

export interface UseCasePost {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  readTime: string;
  publishDate: string;
  author: string;
  content: string;
  hasCustomStyles: boolean;
  image?: string;
}

const BASE_URL = import.meta.env.BASE_URL || '';
const USECASES_BASE_PATH = `${BASE_URL.endsWith('/') ? BASE_URL : BASE_URL + '/'}content/use-cases`;

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

      if (value.startsWith('[') && value.endsWith(']')) {
        try {
          data[key] = JSON.parse(value);
        } catch {
          data[key] = value;
        }
      } else {
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

function getUseCaseBasePath(slug: string): string {
  return `${USECASES_BASE_PATH}/${slug}`;
}

function transformAssetPaths(content: string, slug: string): string {
  const basePath = getUseCaseBasePath(slug);

  let transformed = content.replace(
    /!\[([^\]]*)\]\(\.\/(assets\/[^)]+)\)/g,
    `![$1](${basePath}/$2)`
  );

  transformed = transformed.replace(
    /src=["']\.\/assets\/([^"']+)["']/g,
    `src="${basePath}/assets/$1"`
  );

  transformed = transformed.replace(
    /src=["']\.\/(assets\/[^"']+\.mp4)["']/gi,
    `src="${basePath}/$1"`
  );

  transformed = transformed.replace(
    /href=["']\.\/(assets\/[^"']+)["']/g,
    `href="${basePath}/$1"`
  );

  return transformed;
}

function resolveAssetPath(path: string | undefined, slug: string): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')) {
    return path;
  }
  if (path.startsWith('./')) {
    return `${getUseCaseBasePath(slug)}/${path.slice(2)}`;
  }
  return `${getUseCaseBasePath(slug)}/${path}`;
}

async function checkCustomStyles(slug: string): Promise<boolean> {
  try {
    const response = await fetch(`${getUseCaseBasePath(slug)}/styles.css`, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

async function fetchUseCaseContent(slug: string): Promise<UseCasePost | null> {
  const path = `${getUseCaseBasePath(slug)}/index.md`;

  try {
    const [response, hasCustomStyles] = await Promise.all([
      fetch(path),
      checkCustomStyles(slug)
    ]);

    if (!response.ok) {
      console.error(`Failed to fetch use case: ${slug}`);
      return null;
    }

    const rawContent = await response.text();
    const { data: frontmatter, content } = parseFrontmatter(rawContent);

    const transformedContent = transformAssetPaths(content, slug);

    return {
      slug,
      title: (frontmatter.title as string) || slug,
      summary: (frontmatter.summary as string) || (frontmatter.description as string) || '',
      tags: (frontmatter.tags as string[]) || [],
      readTime: (frontmatter.readTime as string) || '5 min',
      publishDate: (frontmatter.publishDate as string) || (frontmatter.date as string) || new Date().toISOString().split('T')[0],
      author: (frontmatter.author as string) || 'Nubra',
      content: transformedContent.trim(),
      hasCustomStyles,
      image: resolveAssetPath(frontmatter.image as string | undefined, slug),
    };
  } catch (error) {
    console.error(`Error fetching use case ${slug}:`, error);
    return null;
  }
}

export async function getAllUseCases(): Promise<UseCasePost[]> {
  const results = await Promise.all(
    useCaseSlugs.map(slug => fetchUseCaseContent(slug))
  );

  return results
    .filter((post): post is UseCasePost => post !== null)
    .sort((a, b) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime());
}

export async function getUseCaseBySlug(slug: string): Promise<UseCasePost | null> {
  if (!useCaseSlugs.includes(slug)) {
    return null;
  }
  return fetchUseCaseContent(slug);
}

export async function getAllUseCaseTags(): Promise<string[]> {
  const posts = await getAllUseCases();
  const allTags = new Set<string>();

  posts.forEach(post => {
    post.tags.forEach(tag => allTags.add(tag));
  });

  return Array.from(allTags).sort();
}

export function getUseCaseStylesUrl(slug: string): string {
  return `${getUseCaseBasePath(slug)}/styles.css`;
}

export { useCaseSlugs };
