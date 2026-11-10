import { visit } from 'unist-util-visit';

/**
 * Remark plugin to fix links in MDX files
 *
 * - Transforms bare relative links like [text](page_name) in docs pages to absolute paths like
 *   [text](/docs/next/page_name), based on the current file's location in the content directory.
 * - Prefixes root-relative links and images like [text](/docs/next/page_name) with the base path
 *   (`BASE_PATH`), which Astro doesn't do for Markdown content. This matters when the site is
 *   served from a subpath, such as the PR previews (/octez.js/pr-<N>/).
 */
export function remarkRelativeLinks() {
  return (tree, file) => {
    // e.g., /path/to/website/src/content/docs/next/quick_start.mdx
    const filePath = file.history[0] || '';

    // Normalize base URL to always have trailing slash for path joining
    const envBase = process.env.BASE_PATH || '/';
    const baseUrl = envBase.endsWith('/') ? envBase : `${envBase}/`;

    // Extract the version after 'content/docs/' (e.g., 'next' or '23.0.0'), for docs pages only
    const match = filePath.match(/content\/docs\/([^/]+)\//);
    const versionPath = match ? `${baseUrl}docs/${match[1]}` : undefined;

    const rewrite = (url) => {
      if (typeof url !== 'string') return url;

      // Root-relative (but not protocol-relative //host): prefix with the base path once
      if (url.startsWith('/') && !url.startsWith('//')) {
        if (baseUrl === '/' || url.startsWith(baseUrl) || `${url}/` === baseUrl) return url;
        return `${baseUrl}${url.slice(1)}`;
      }

      // Skip hash links, explicit relative paths, and URLs with a scheme (http:, mailto:, …)
      if (
        !versionPath ||
        url === '' ||
        url.startsWith('#') ||
        url.startsWith('./') ||
        url.startsWith('../') ||
        /^[a-z][a-z0-9+.-]*:/i.test(url)
      ) {
        return url;
      }

      // Bare page name in a docs page: resolve it in the same docs version
      return `${versionPath}/${url}`;
    };

    visit(tree, ['link', 'definition'], (node) => {
      node.url = rewrite(node.url);
    });
    visit(tree, ['image'], (node) => {
      if (typeof node.url === 'string' && node.url.startsWith('/') && !node.url.startsWith('//')) {
        node.url = rewrite(node.url);
      }
    });
  };
}
