---
name: protocol-rotation
description: Rotate octez.js from a deprecated Tezos protocol/testnet lane (OLD, e.g. Ushuaia/U025) to its successor (NEW, e.g. V/U026). Use when a new protocol is rolled out and the previous lane is shut down. Asks for the inputs it needs (incl. a funded testnet secret key), infers hash, number, testnet name, chain id and RPCs, replaces/removes every OLD reference in `next` docs, code, tests and integration config, sweeps for missed patterns, verifies live on the NEW lane (integration suite, reveal re-measurement, re-recorded docs sample) and writes a classified report at the repo root.
argument-hint: "<old> to <new>   e.g. 'Ushuaia to V', 'U025 to U026', 'ushuaianet to vnet'"
---

# protocol-rotation

Replace the deprecated protocol lane **OLD** by its successor **NEW** (always x → x+1; the
deprecated lane is shut down, so it is always *removed*, never kept alongside).
Reference runs: Tallinn → Ushuaia (issue #89, branch `ci/tallinn-to-ushuaianet`), including the
live verification phase (Phase 4b).
`patterns.md` is the catalog of where OLD hides and how each spot is classified — read it first.
Helper scripts in this directory: `sweep.sh`, `measure-reveal.js`, `regen-rpc-sample.py`, `run-itests.sh`.

## Inputs — ask for all of them up front (AskUserQuestion), before touching anything

1. **OLD → NEW** (confirm the parsed pair; "Talin" ≙ Tallinn-style typos are common). If NEW is ambiguous
   or not yet published, ask.
2. **Tracking issue** to reference in commit messages (or none).
3. **An existing branch `chore/<old>-to-<new>`?** Ask what to do (inspect / new name / discard). Only
   discard, and only without looking, if the user says so.
4. **Network access** for read-only queries (teztnets.com, public RPCs, GitLab API): needed for Phase 1.
5. **A funded testnet secret key (`SECRET_KEY`) on the NEW lane — required for Phase 4b.** Offer both routes:
   - *Keygen* (`OCTEZJS_KEYGEN_URL` + `OCTEZJS_KEYGEN_TOKEN`): the CI-style route, but needs a running keygen.
   - **One-time funded key, pasted in chat (recommended — much easier).** Ask the user for a throwaway
     `edsk…` key funded on the NEW testnet (a few thousand ꜩ is plenty; unrevealed is fine). It is a
     testnet key; the user pasting it is fine. Without a key, skip Phase 4b and list every live check under
     "Needs a human" in the report.
6. **Spending consent** for test funds on the NEW lane (the suite originates contracts; the reveal measurement
   funds throwaway accounts), and whether to add a changelog entry (default: yes, see Phase 3).

### Handling the key (hard rules)

- Pass it **inline per command**: `SECRET_KEY='edsk…' <command>`. Each Bash call is a fresh shell, so
  `! export` does **not** reach you, and a key left in a variable is gone next call.
- **Never write it anywhere**: no files, no `.env`, no commit, no report, no scratchpad script, no memory.
  Scripts take it from the environment only.
- **Never probe the repo's hard-coded fallback key** in `integration-tests/config.ts` (the auto-mode
  classifier blocks it as credential exploration). Only use a key the user gave you for this run.
- First check, read-only: derive the address, then `GET …/context/contracts/<pkh>/balance` and
  `…/manager_key` on the NEW RPC. Report address + balance + revealed or not.

## Hard rules (from CLAUDE.md and the user)

- Work on a **new branch** `chore/<old>-to-<new>` off the current default branch. **Local commits only.**
  Never push, never trigger/re-run CI, never open a PR or **create/modify GitHub issues** unless explicitly told.
- **Never read, copy or diff `taquito/*` `website/` content** (licensing hard stop). This skill never
  needs the `taquito` remote at all.
- **Docs: edit `website/src/content/docs/next/` only.** Every other docs dir (`0.9.0/`, `1.0.0/`, any
  future versioned dir, `website/versioned_docs*`) is a frozen snapshot — never edit it, never hardcode
  its name; treat "everything under `website/src/content/docs/` except `next/`" as out of scope.
- **Do not edit `.github/workflows/*`**, lockfiles, or bump package versions. CI lane decisions are the
  maintainers'. Report workflow hits instead (section "Needs a human").
- Never introduce `@taquito/*` dependencies, and never add a dependency to the repo for a measurement
  (install helper libs in a scratchpad dir outside the repo).
- **Never invent facts.** Hash, chain id, testnet name, RPCs and any doc claim (cycle length, block
  time, gas numbers) must come from a source you queried this run (see Phase 1). Unverifiable → flag it,
  don't rewrite it. Say plainly when a value is derived rather than observed.
- The integration suite and the reveal measurement run **only with the user's key and consent** (inputs 5–6),
  against the NEW lane only. Unit tests, build, lint and type-check are always fine.
- Never `git stash -u` (it swallows untracked `briefs/`/`roster/`); compare against base with `git worktree add`.
- **Check real exit codes.** `cmd > log; echo exit=$?` and background-task "completed" notifications only
  say your wrapper finished: read `exit=` (124 = timeout) and the vitest summary before claiming success.

## Phase 0 — Preflight

1. Collect the Inputs above. Parse the hint into OLD and NEW (protocol names, `U025`/`026`/`V`, hashes, or
   testnet names).
2. `git status` must be clean apart from untracked unrelated dirs (ignore `briefs/`, `roster/`); create the branch.

## Phase 1 — Infer the facts (no hardcoding)

Build a fact table for OLD and NEW; record each value with its source. Use, in order:

| Fact | Source |
|---|---|
| name, number (`025`), letter (`U025`), testnet name (`<name>net`) | the hint + `https://teztnets.com/teztnets.json` |
| full protocol hash + 7-char prefix (used in error ids `proto.025-PsUshua.`) | teztnets.json (`last_baking_daemon`/`protocol` fields) or `GET <rpc>/chains/main/blocks/head/header` → `.protocol`; cross-check the repo's `Protocols` enum |
| chain id | `GET <rpc>/chains/main/chain_id` on the NEW testnet |
| RPC URLs + liveness | teztnets.json `rpc_url`, plus the providers already listed in `website/public/rpc_nodes.json` (Trilitech `tezos-<net>.octez.io`, TzKT `rpc.tzkt.io/<net>`); probe each with `curl .../chains/main/blocks/head/header` |
| is NEW live on mainnet? | `https://rpc.tzkt.io/mainnet/chains/main/blocks/head/header` → `.protocol` |
| protocol constants (cycle length, block time, cost_per_byte, origination_size) | `GET <rpc>/chains/main/blocks/head/context/constants` on **mainnet** (testnets can be shortened — e.g. a 300-block cycle) |
| feature flags that gate measurements (e.g. `tz5_account_enable`) | same constants call, on NEW **and** on weeklynet (alpha) |
| docs links `…/docs/<new>/…`, `gitlab.io/<new>/…` | `curl -L` → 200 **and** the `id="<anchor>"` present in the HTML |
| mempool OpenAPI file | GitLab **API** tree: `/api/v4/projects/tezos%2Ftezos/repository/tree?path=docs/api&ref=master` (name drops `-rc` once released, e.g. `ushuaia-mempool-openapi.json`). `-/blob/…` URLs return 200 for any name — useless |
| existing repo scaffolding for NEW | `git grep` for the NEW hash/name/net (enum entries, known-contracts file, package.json scripts, config.ts block) |

Print the fact table and the proposed OLD token regex (case-insensitive ERE) before editing:
`name|<name>net|full-hash|hash7|proto0?NNN|UNNN|Proto0?NN` — **include the hash and number forms**: a
name-only grep misses `PtTALLiNt`, `ConstantsResponseProto024`, `proto.024-PtTALLiN.…`.

## Phase 2 — Inventory + classification

Run `skills/protocol-rotation/sweep.sh '<regex>'` (no allowlist yet) and also grep for the OLD **lane**
words in `package.json` scripts and env-var names (`<NAME>NET`, `RUN_<NAME>NET_WITH_SECRET_KEY`,
`TEZOS_RPC_<NAME>NET`). Classify every hit with `patterns.md` into:

- **A — Lane / infra** (replace or delete)
- **B — Product & `next` docs network lists** (replace or delete)
- **C — Semantic or historical** (decide per hit: update, keep, or flag)
- **D — Never touch** (registries, recorded fixtures, upstream links, frozen docs, workflows)

## Phase 3 — Apply (one local commit per class)

Make sure NEW scaffolding exists *before* removing OLD, following the checklist in the
"Featurenet placeholder" comment of `integration-tests/config.ts`:
`Protocols.<NEWHASH>` enum entries (local-forging, michel-codec, octez.js `constants.ts` incl. the
`'NNN': [Protocols.X]` map), `ConstantsResponseProtoNNN` type + `getConstants` overloads if the schema
changed, `known-contracts-<newnet>.ts`, `package.json` `test:<newnet>*` scripts, config.ts
ephemeral/secret-key entries and env switches, estimation baselines `[Protocols.<NEW>]` in
`__tests__/contract/tz*-estimation-tests.spec.ts` (fail-loud if missing — do **not** copy OLD values
speculatively; record them in Phase 4b or flag), protocol-ordering test.

Then, per class:

- **A**: delete OLD `config.ts` blocks, `known-contracts-<oldnet>.ts`, `test:<oldnet>*` scripts and env
  switches; default provider list becomes `shadownet + <newnet>`; fix README/KEYGEN/hammer env names;
  `rpc.includes('<old>')` branches map to NEW (verify the replacement host answers); delete OLD-pinned
  frozen fixtures (e.g. an exhaustive `ConstantsResponseProtoNNN` block) when NEW already has its own.
- **B**: remove OLD from `NetworkType` (wallet-connect) and `ChainIds` (octez.js) — always removed, even
  though public API, and mark the commit `!` with a `BREAKING CHANGE:` footer; add NEW if absent (replace in
  place when the enum has no NEW entry, incl. tests/data). `website/public/rpc_nodes.json`,
  `next/rpc_nodes.mdx`, `next/rpc_nodes_integration_test.mdx`, `next/wallet_API.mdx`,
  `rpc-block-controller.ts`: substitute OLD net → NEW net only after verifying each NEW host answers
  (Phase 1); drop providers whose NEW host is dead.
- **C**: see `patterns.md`. Rewrite a doc claim only if verified against the NEW protocol on mainnet in
  Phase 1; otherwise flag. Feature gates: drop OLD from the protocol list and make sure NEW is in it.
  "Introduced in <OLD>" names (`tallinnCases`, `isTallinnOrLater`) stay. Update the `@see` mempool OpenAPI
  link to the file found via the GitLab API.
- **Changelog (default, unless the user declined)**: add one bullet per breaking removal under
  `### Breaking changes` of the *unreleased* section of `website/src/pages/changelog.mdx` (same style as
  the existing bullets). Never touch released sections.
- **D**: leave alone; record in the report under "Kept".

Commits: `test(integration): …` (A), `feat(<pkg>)!: …` per public API removal (B), `docs: …` (docs/comments).
End each with the attribution trailer required by the session, and reference the tracking issue if given.

## Phase 4 — Final sweep (mandatory, loops)

1. Write an allowlist file (scratchpad) with one ERE per intentional keep, each preceded by a `# reason`
   comment — **only** for class C/D hits you have consciously decided to keep.
2. `skills/protocol-rotation/sweep.sh '<regex>' <allowlist>`.
3. Every line under `== UNEXPLAINED ==` is a miss: classify it, fix it (or allowlist it with a reason),
   re-run. Repeat until UNEXPLAINED is empty **or** the remaining items are explicitly flagged for a
   human (then they must be in the report under "Needs a human" and allowlisted as `# FLAGGED: …`).
4. Widen once: re-run with a looser regex (just the name stem, the net word, and the bare number `\b0?NN\b`
   near `proto|protocol|U`) to catch spellings the regex missed; classify new hits the same way
   (expect false positives such as "Installing", "(24 ms)" — allowlist as `# false positive`).
5. Verify: `npx tsc --noEmit -p integration-tests` (compare errors to the base branch via a worktree — only
   new errors in touched files count), `npm run build`, `npm run lint`, and
   `npx nx run-many -t test -p <touched pkgs>` (at least `@tezos-x/octez.js`, `-wallet-connect`, `-rpc`).

## Phase 4b — Live verification on the NEW lane (needs the funded key; default, not optional)

Run from the repo root after `npm run build`. Key inline each time (see "Handling the key"). Keep logs in
the scratchpad. Do **not** run two of these at once (they share one signer counter).

1. **Account check** — address, balance, `manager_key` on the NEW RPC. If unrevealed, the first suite run
   reveals it.
2. **RPC nodes spec, verbose:** `SECRET_KEY=… npm run test:<newnet>-secret-key -- __tests__/rpc/nodes.spec.ts --reporter=verbose > run.txt`
   (from `integration-tests/`). Expect all green. Then
   `python3 skills/protocol-rotation/regen-rpc-sample.py run.txt` re-records the first sample block of
   `next/rpc_nodes_integration_test.mdx` (header stays `<rpc-url>`, stale tests vanish). Commit as
   `docs(next): re-record the RPC test sample …`. Leave the second (failing, localhost) block alone and note it.
3. **Full suite, resumable:** `SECRET_KEY=… skills/protocol-rotation/run-itests.sh <newnet> 3000 <scratch>/itests`
   — run it with `run_in_background`; it re-runs only unreported files each round and retries failures alone.
   Expect transient failures from signer contention (mempool conflict, confirmation timeout) that pass alone;
   skips are by design (`weeklynet`-gated `security-*`, keygen-only `simple-reveal`). `flextesa/` and
   `ledger/` are excluded — say so. Any failure that survives the retry is a real finding: investigate
   (is it the rotation?) before reporting.
4. **Reveal re-measurement:** `SECRET_KEY=… node skills/protocol-rotation/measure-reveal.js <newnet-rpc>`
   prints consumed gas / minimal fee / storage for fresh tz1–tz4 accounts next to the stored
   `REVEAL_GAS_LIMIT` / `REVEAL_FEE`. Stored = measured + 1–2 gas / ≈1 mutez margin. Same within margin →
   only relabel the three comments in `packages/octez.js/src/constants.ts` ("… in <NEW> Protocol"), show the
   table to the user, commit. Different → show the table and ask before changing values.
5. **tz5 (ML-DSA-44):** only measurable where `tz5_account_enable` is true (check NEW, else weeklynet/alpha).
   If NEW has it disabled, don't block the rotation: leave `TZ5` as is and flag it. To calibrate anyway, use
   weeklynet with the same key (check it is funded there): install `@noble/post-quantum` in a scratch dir
   (never the repo) and set `MLDSA_DEP=<that dir>`; `measure-reveal.js` then also prints tz5 gas (no signing
   needed). The estimator's `opSize`/fee was wrong for tz5 (trilitech/octez.js#119): if it is fixed, use the
   estimate; otherwise derive the fee as `100 + 0.1*gas + size` with size ≈ 3797 bytes (signed wire layout in
   `patterns.md`) and label it "derived", alpha numbers. Only claim it is confirmed if you injected a signed
   reveal by hand and saw it included.
6. Estimation baselines: the `tz*-estimation-tests` specs pass in step 3 ⇒ the stored `[Protocols.<NEW>]`
   baselines hold; if they fail, record real values (never copy OLD) and flag.

Never push the funded account's key, address history or logs into the repo or the report (the address and
balance are fine to mention).

## Phase 5 — Report

Write `./protocol-rotation-<OLDLETTER>-to-<NEWLETTER>.md` at the repo root (e.g. `protocol-rotation-T-to-U.md`;
use the protocol letters/numbers from Phase 1). Leave it untracked unless told otherwise. Sections:

1. **Summary** — OLD → NEW, fact table with sources, branch, commits, verification results (pass/fail, with
   the pre-existing failures called out), and an **Integration run** line: files run / passed / skipped /
   transient-failed-then-passed / excluded, plus `nodes.spec.ts` count. Never write the key.
2. **Changes by class** — A / B / C / D, each a table `file | what changed | why`; counts per class.
3. **Kept (intentional)** — every allowlisted hit grouped by reason (registry entry, recorded fixture,
   "introduced in", changelog, upstream link, frozen docs).
4. **Needs a human** — only what is still open: unverified or derived values (say which), skipped checks
   (no key, flextesa/ledger), workflow files mentioning OLD, dead NEW endpoints, new bugs found (with issue
   links if the user had them filed). Resolved items go in a short "Resolved" list with their commit.
5. **Sweep log** — number of sweep iterations and what each iteration caught (this is how we improve
   `patterns.md`).

Finally, if the sweep or live phase caught patterns that `patterns.md` did not list, **append them to
`patterns.md`** in the same branch (as a separate commit) so the next rotation starts smarter.
