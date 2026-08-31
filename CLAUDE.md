# octez.js — context for Claude agents

## What this repo is

`octez.js` is a **fork and rebrand of [Taquito](https://github.com/ecadlabs/taquito)**, the
TypeScript SDK for Tezos. It is now maintained by **Nomadic Labs** under the **trilitech** GitHub
org. It is not a from-scratch project — most of its code, tests, and docs originate from Taquito
and were carried over via rename, not reimplementation.

- `origin` remote → `git@github.com:trilitech/octez.js.git` (this repo)
- `taquito` remote → `https://github.com/ecadlabs/taquito.git` (upstream, kept for tracking)
- License: **Apache-2.0**, unchanged from upstream. See `NOTICE` for the copyright chain
  (Nomadic Labs 2026 + ECAD Labs Inc. 2023) and explicit fork attribution.
- Monorepo tool: **Nx** + npm workspaces (`packages/*`, `example`, `integration-tests`, `website`).

## Naming: the rename is comprehensive but not 100% finished

Package/class names were mechanically renamed `taquito-*` → `octez.js-*` /
`@taquito/*` → `@tezos-x/octez.js-*` (e.g. `TaquitoProvider` → `OctezJsProvider`,
`TaquitoError` → `OctezJsError`). When touching naming:

- **Don't assume a `Taquito*` symbol you find is legacy cruft to "clean up" on sight.** Some are
  deliberate API-stability choices. Check history/intent before renaming public API surface —
  that's a breaking change and should be a conscious decision, not incidental to another task.
- A few known leftovers exist by design, not by accident (stale `TAQUITO_*` env var prefixes, a
  couple of `taquito.io` doc URLs, `@taquito/sapling-wasm` as the one remaining real npm
  dependency on the Taquito org). Don't silently "fix" these without flagging it — they're tracked,
  not forgotten.

## Versioning is intentionally decoupled from Taquito

- octez.js packages reset to **`1.0.0`** at fork time and version independently. Taquito's own
  package version (`24.x`, `25.x`) is a **different, unrelated number** — never treat a Taquito
  version bump as something to mirror here.
- **Never blindly cherry-pick Taquito's release-sync commits** (version bumps, lockfile
  regeneration, versioned-docs snapshots). They're taquito-version-numbered and don't apply.
- `packages/octez.js-core/src/version.ts` is auto-generated (`// DO NOT MANUALLY EDIT`) — don't
  hand-edit it; if it looks stale relative to `package.json`, that's a build/release-tooling gap to
  flag, not something to patch by hand.

## Backporting from upstream Taquito — mandatory process

This repo pulls fixes from `taquito/main` deliberately and selectively, never by merge/rebase onto
it. When asked to look at upstream parity or backport something:

### ⚠️ MANDATORY HARD STOP — Taquito's `website/` went proprietary mid-fork

On **2026-02-10**, upstream commit **`60ff0dcddfa19f1c939df10f861aa28d7850daa7`**
(`docs: establish dual licensing for website and source code`, author Neil Mangan) changed
Taquito's licensing terms. This commit exists on `taquito/main` (and most other `taquito/*`
branches) but is **not** an ancestor of `origin/master` — octez.js forked before this change and
has never picked it up.

**What it did, concretely:**
- Added `website/LICENSE`: a proprietary, all-rights-reserved license for the entire `website/`
  directory and everything under it — "documentation, written content, tutorials, guides, images,
  graphics, logos, design assets, website source code (HTML, CSS, JavaScript, MDX, Astro, and
  related configuration files), and any other materials." Copyright ECAD Labs Inc.
- Rewrote `NOTICE` to add a "WEBSITE AND DOCUMENTATION EXCLUSION NOTICE" stating the Apache
  License, Version 2.0 does **not** apply to that directory.
- Rewrote `README.md` to describe Taquito as **dual-licensed**: source code under Apache-2.0,
  `website/` under a separate proprietary license with **no permission granted** to copy,
  distribute, modify, or create derivative works — commercial or non-commercial — without ECAD
  Labs' prior written consent.

**What this means for octez.js — read literally, not loosely:**
- Before this commit, all of Taquito was Apache-2.0 and safely portable. **From this commit
  forward, that is no longer true for anything under `website/` in `taquito/main`.** This isn't
  "be careful re-authoring docs" advice anymore — it is a license boundary. "Re-author instead of
  copying" is **not** a safe workaround either: paraphrasing or restructuring proprietary content
  you read from a NO-LICENSE-GRANTED source is still using content you have no rights to, and
  whether that's acceptable is a legal judgment call, not an engineering one.
- **Every file under `website/` in any `taquito/*` branch, at or after commit `60ff0dcdd`, is
  off-limits to cherry-pick, diff-and-port, copy, or derive-from by an agent, full stop.** This
  includes octez.js's own `website/` directory even though it's a separately-maintained,
  independently Apache-2.0-licensed tree — the risk is upstream content leaking in, not octez.js's
  own files.
- **octez.js's own `NOTICE` currently does not carry this exclusion** and still describes the
  whole project as Apache-2.0 with no `website/` carve-out. Whether octez.js's own `website/`
  needs a NOTICE/LICENSE change of its own (since it's independently authored, not obviously) is
  itself a legal question, not something an agent should decide.

**Required behavior:** if a task would involve reading `taquito/main`'s `website/` content for the
purpose of porting, diffing, "getting inspiration from," or otherwise transferring anything from it
into octez.js — or if a diff/backport task turns out to touch any file under `website/` on the
Taquito side — **stop immediately, do not perform the port, and surface exactly this finding
(commit hash, date, what's blocked) to the human** so they can decide how to proceed. Do not
resolve this ambiguity yourself, and do not silently skip it either — say so explicitly.

1. **Diff, don't merge.** Compare commit-by-commit / content-by-content against `taquito/main`.
   The fork was replayed, not merged, so git ancestry does not connect the two histories — use
   content comparison (normalizing brand tokens like `taquito`/`octez.js`/`ecadlabs`/`tezos-x`),
   not `git merge-base`-style ancestry checks, to find what's actually missing or diverged.
2. **Anything outside `website/` is still Apache-2.0** and follows the normal re-author-don't-copy
   care for prose vs. code described above — but `website/` itself is governed by the hard stop
   above, not by editorial judgment.
3. **A commit being unmerged upstream is not sufficient reason to port it.** Check whether:
   - it's purely mechanical version-bump/lockfile noise (skip),
   - it conflicts with independent fixes already made here (e.g. this repo already replaced a
     decommissioned mainnet RPC endpoint; Taquito's overlapping fix would collide),
   - it bundles an infra/CI-topology decision (e.g. retiring a testnet lane) that must be *this
     repo's own call*, not inherited just because upstream made it.
4. **CI lane decisions are independent.** octez.js may keep testnets (e.g. tallinnnet/ushuaianet)
   active that Taquito has retired, or vice versa — this is a maintainer decision based on this
   repo's actual funded-key/infra access, never something to copy from upstream's CI file as-is.
5. When a cherry-pick *is* appropriate, keep the original `Co-Authored-By` trailer and do the
   `taquito-*` → `octez.js-*` path/name adaptation in the same commit.

## CI state — read before assuming a workflow "should" run

Several `.github/workflows/*.disabled` files are **deliberately disabled**, not broken and
forgotten (some are redundant with `main.yml`, some need infra/secrets not yet provisioned, some
are superseded by a differently-named replacement). Before re-enabling, deleting, or "fixing" a
disabled workflow, read the workflow file itself and check `git log` on it for why it was turned
off, rather than assuming it's dead code. Known issue: `codeql-analysis.yml.disabled` targets
branch `main`, but the repo default branch is `master` — it will never trigger until that's fixed.

## Common commands

- `npm run build` — build all packages via Nx (excludes the website)
- `npm run test` — unit tests via Nx across packages (excludes integration-tests and website)
- `npm run lint` — package-catalog check + per-workspace lint
- `npm run integration-tests` — originates known contracts, then runs integration suite (needs
  funded test keys / network access — see `integration-tests/README.md` and `integration-tests/config.ts`)
- `npm run build-website` — full install + build + website build

## General rules for agents working in this repo

- Don't treat this as a greenfield project — when unsure why something looks the way it does,
  assume it's inherited from Taquito or a deliberate fork-time decision before assuming it's a bug.
- Don't introduce new `@taquito/*` npm dependencies (only `@taquito/sapling-wasm` is an accepted,
  tracked exception pending republishing).
- Never port, copy, or derive anything from `taquito/main`'s `website/` directory (see the
  mandatory hard stop above) — stop and ask a human instead.
- Don't bump package versions to match Taquito's version line.
- Flag, don't silently resolve, any inconsistency you find between this repo and Taquito that
  touches licensing, attribution, or the `NOTICE` file — those are legal/compliance-sensitive.
