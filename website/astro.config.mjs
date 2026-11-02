// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import AutoImport from 'astro-auto-import';
import { remarkLiveCode } from './src/utils/remark-live-code.mjs';
import { remarkCallouts } from './src/utils/remark-callouts.mjs';
import { remarkRelativeLinks } from './src/utils/remark-relative-links.mjs';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { unified } from '@astrojs/markdown-remark';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from "@tailwindcss/vite";
import { DEFAULT_VERSION } from './src/config/versions.mjs';

import sitemap from '@astrojs/sitemap';

const fetchPolyfillPath = fileURLToPath(
  new URL('./src/scripts/fetch-polyfill.ts', import.meta.url)
);

// Resolve shim paths to absolute ESM paths for monorepo compatibility. Resolved through the
// package's `exports` so it works wherever npm hoists vite-plugin-node-polyfills to.
const shimPaths = Object.fromEntries(
  ['buffer', 'global', 'process'].map((name) => [
    `vite-plugin-node-polyfills/shims/${name}`,
    fileURLToPath(import.meta.resolve(`vite-plugin-node-polyfills/shims/${name}`)),
  ])
);

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

/**
 * Restrict Vite plugin(s) to the browser (`client`) environment.
 *
 * vite-plugin-node-polyfills aliases Node built-ins (e.g. `path` -> the CommonJS
 * `path-browserify`) through a global `resolve.alias`. Since Astro 7 the content config
 * and prerendering run through Vite's Node-side module runner, where that alias breaks
 * with "module is not defined". The alias is therefore moved from the global `config`
 * hook to a client-only `configEnvironment` hook.
 *
 * @param {import('vite').PluginOption} plugins
 * @returns {import('vite').Plugin[]}
 */
function clientOnly(plugins) {
  return /** @type {import('vite').Plugin[]} */ ([plugins].flat(Infinity)).map((plugin) => {
    const { config } = plugin;
    if (typeof config !== 'function') {
      return { ...plugin, applyToEnvironment: (env) => env.config.consumer === 'client' };
    }
    /** @type {import('vite').UserConfig['resolve']} */
    let clientResolve;
    return {
      ...plugin,
      applyToEnvironment: (env) => env.config.consumer === 'client',
      config(userConfig, env) {
        const { resolve, ...rest } = /** @type {import('vite').UserConfig} */ (
          config.call(this, userConfig, env)
        );
        clientResolve = resolve;
        return rest;
      },
      configEnvironment(name) {
        return name === 'client' && clientResolve ? { resolve: clientResolve } : undefined;
      },
    };
  });
}

// Ensure base path has trailing slash for proper asset resolution
const basePath = process.env.BASE_PATH || '/';
const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;

// One redirect per page of the default docs version: /docs/<page> -> /docs/<DEFAULT_VERSION>/<page>
const docRedirects = Object.fromEntries(
  fs.readdirSync(fileURLToPath(new URL(`./src/content/docs/${DEFAULT_VERSION}`, import.meta.url)))
    .filter((file) => /\.mdx?$/.test(file))
    .map((file) => file.replace(/\.mdx?$/, ''))
    .map((page) => [`/docs/${page}`, `/docs/${DEFAULT_VERSION}/${page}`])
);

// https://astro.build/config
export default defineConfig({
  site: process.env.SITE_URL || 'https://octez-js.tezos.com',
  base: normalizedBase,
  trailingSlash: 'never',
  // Stable, unversioned URLs (e.g. for READMEs): /docs/<page> follows DEFAULT_VERSION,
  // which the release workflow bumps.
  redirects: docRedirects,
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
    processor: unified({
      remarkPlugins: [remarkRelativeLinks, remarkCallouts, remarkLiveCode],
    }),
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
      ...clientOnly(nodePolyfills({
        include: ['buffer', 'stream', 'crypto', 'path', 'http', 'https'],
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
        protocolImports: true,
      })),
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