// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import AutoImport from 'astro-auto-import';
import { remarkLiveCode } from './src/utils/remark-live-code.mjs';
import { remarkCallouts } from './src/utils/remark-callouts.mjs';
import { remarkRelativeLinks } from './src/utils/remark-relative-links.mjs';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, resolve as resolvePath } from 'node:path';
import tailwindcss from "@tailwindcss/vite";

const require = createRequire(import.meta.url);

import sitemap from '@astrojs/sitemap';

const fetchPolyfillPath = fileURLToPath(
  new URL('./src/scripts/fetch-polyfill.ts', import.meta.url)
);

// Resolve shim paths to absolute ESM paths for monorepo compatibility.
// Hardcoded ./node_modules/... only works when deps aren't hoisted to the
// repo root, so derive the package root from a known exported subpath.
// require.resolve returns the CJS entry (./dist/index.cjs); strip two
// segments to reach the package root, then point at the ESM shim files.
const nodePolyfillsDir = resolvePath(
  dirname(require.resolve('vite-plugin-node-polyfills/shims/buffer')),
  '..', '..', '..'
);
const shimPaths = {
  'vite-plugin-node-polyfills/shims/buffer': `${nodePolyfillsDir}/shims/buffer/dist/index.js`,
  'vite-plugin-node-polyfills/shims/global': `${nodePolyfillsDir}/shims/global/dist/index.js`,
  'vite-plugin-node-polyfills/shims/process': `${nodePolyfillsDir}/shims/process/dist/index.js`,
};

// Custom Rollup plugin to resolve polyfill shims from any location in the monorepo
function polyfillShimsResolver() {
  return {
    name: 'polyfill-shims-resolver',
    /** @param {string} source */
    resolveId(source) {
      if (source in shimPaths) {
        return shimPaths[/** @type {keyof typeof shimPaths} */ (source)];
      }
      return null;
    },
  };
}

// Ensure base path has trailing slash for proper asset resolution
const basePath = process.env.BASE_PATH || '/';
const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;

// https://astro.build/config
export default defineConfig({
  site: process.env.SITE_URL || 'https://octez.js.dev',
  base: normalizedBase,
  trailingSlash: 'never',
  integrations: [AutoImport({
    imports: [
      './src/components/SimpleCodeRunner.astro',
      './src/components/Tabs.astro',
      './src/components/TabItem.astro',
    ],
  }), mdx({
    extendMarkdownConfig: true,
  }), sitemap({
    filter: (page) => {
      // Exclude old documentation versions and 'next' (development) from sitemap
      // Only index released versions (0.9.0+)
      const excludedVersions = ['21.0.0', '22.0.0', '23.0.0', '23.1.0', 'next'];
      return !excludedVersions.some(version => page.includes(`/docs/${version}/`));
    },
  })],
  markdown: {
    remarkPlugins: [remarkRelativeLinks, remarkCallouts, remarkLiveCode],
    syntaxHighlight: false,
  },
  vite: {
    resolve: {
      alias: {
        // Replace node-fetch with browser native fetch
        'node-fetch': fetchPolyfillPath,

        // Component alias
        '@components': fileURLToPath(new URL('./src/components', import.meta.url)),

        // Resolve polyfill shims for monorepo workspace packages
        ...shimPaths,
      },
    },
    plugins: [
      polyfillShimsResolver(),
      tailwindcss(),
      nodePolyfills({
        include: ['buffer', 'stream', 'crypto', 'path', 'http', 'https'],
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
        protocolImports: true,
      }),
    ],
    build: {
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
    optimizeDeps: {
      exclude: [
        'vite-plugin-node-polyfills/shims/buffer',
        'vite-plugin-node-polyfills/shims/global',
        'vite-plugin-node-polyfills/shims/process',
      ],
    },
  },
});