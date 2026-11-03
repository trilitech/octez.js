# octez.js website

The documentation site published at [octez-js.tezos.com](https://octez-js.tezos.com). It is an
[Astro](https://astro.build) site and an npm workspace of the monorepo
(`@tezos-x/octez.js-website`), so its dependencies are installed from the root `package-lock.json`.

## Running it locally

From the repository root:

```bash
npm ci
npm run build                                   # the site imports the built packages
npm -w @tezos-x/octez.js-website run dev        # dev server on http://localhost:4321
```

To produce the static site in `website/dist/`:

```bash
npm -w @tezos-x/octez.js-website run build
```

## Layout

- `src/content/docs/next/`: documentation for the next, unreleased version. Edit these pages.
- `src/content/docs/<version>/`: frozen snapshots of released versions.
- `src/pages/`: standalone pages (home, changelog, legal pages, ...).
- `src/components/`, `src/layouts/`: Astro components and layouts.
- `src/cloudflare/`: Cloudflare Workers used by the site (feedback, chat).
- `public/`: static assets served as is.

## Scripts

Run them with `npm -w @tezos-x/octez.js-website run <script>`:

| Script                   | What it does                                                        |
| ------------------------ | ------------------------------------------------------------------- |
| `dev`                    | Starts the local dev server                                         |
| `build`                  | Generates `public/llms.txt`, then builds the site into `dist/`      |
| `preview`                | Serves the built site locally                                       |
| `docs:version <version>` | Copies `src/content/docs/next/` into a new versioned snapshot       |
| `generate:llms`          | Regenerates `public/llms.txt` from the docs                         |
| `generate:rpc`           | Prints the community RPC nodes table from `rpc_nodes.json` as MDX   |
