# Where a protocol lane hides in octez.js — pattern catalog

Tokens for protocol `P` (derive from Phase 1, never hardcode): name (`tallinn`/`Tallinn`/`TALLINN`),
net (`tallinnnet`/`TALLINNNET`/`Tallinnnet`), full hash, 7-char hash prefix, `024`/`U024`/`Proto024`/`Proto24`,
chain id. A **name-only grep misses hash/number hits** (found in the Tallinn → Ushuaia run:
`PtTALLiNt`, `ConstantsResponseProto024`, `proto.024-PtTALLiN.…`).

Scope: git-tracked files; docs only under `website/src/content/docs/next/`; skip lockfiles and
`.github/workflows` (report only).

## A — Lane / infra (replace or delete)

| Pattern | Typical files | Action |
|---|---|---|
| `<P>netEphemeral` / `<P>netSecretKey` config blocks, `knownContracts<P>net` import | `integration-tests/config.ts` | delete; default list → `shadownet + <NEW>net`; secret-key aggregate list → NEW |
| env switches `<P>NET`, `RUN_<P>NET_WITH_SECRET_KEY`, `TEZOS_RPC_<P>NET` | `config.ts`, `README.md`, `rpc-injection-hammer.ts` | delete OLD branch / rename to NEW |
| `known-contracts-<P>net.ts` | `integration-tests/` | `git rm` (NEW has own file; else `git mv`+regenerate addresses — flag) |
| `test:<p>net`, `:shard`, `-secret-key` scripts | `integration-tests/package.json` | delete OLD; ensure NEW's exist |
| docs commands/env (`TALLINNNET=true npm run test`, `npm run test:<p>net …`) | `integration-tests/README.md`, `KEYGEN.md`, `next/rpc_nodes_integration_test.mdx` | rename to NEW |
| `rpc.includes('<p>')` host switches, `rpc.tzkt.io/<p>net` | `__tests__/{contract/operations,wallet}/failing-noop.spec.ts` | map to NEW (verify host) |
| OLD-pinned exhaustive fixture block (`<p>net(...)` + `ConstantsResponseProtoNNN`) | `__tests__/rpc/get-protocol-constants.spec.ts` | delete block, drop now-unused type import, fix the "networks that stay put" comment |
| cspell word list | `cspell.json` | swap `<p>net` → `<new>net` |
| CLAUDE.md lane examples | `CLAUDE.md` | update example names only (no policy changes) |

## B — Product & `next` docs network lists (replace or delete)

| Pattern | Files | Action |
|---|---|---|
| `NetworkType.<P>NET = '<p>net'` | `packages/octez.js-wallet-connect/src/types.ts` (+ its tests/data: `tezos:<p>net:tz…`, error strings `"<p>net" is missing…`) | replace by NEW; breaking → `!` commit |
| `ChainIds.<P>NET = 'NetX…'` | `packages/octez.js/src/constants.ts` | delete (always removed); breaking → `!` commit |
| `{net, url, provider}` entries | `website/public/rpc_nodes.json` | substitute net+host for all providers; verify each answers |
| `<TabItem value="<p>net">`, `Tabs values=[…]`, `<BlockLevel network=…>` | `next/rpc_nodes.mdx` | substitute (keep table shape) |
| network union strings `'mainnet' \| '<p>net' \| …` / prose lists | `next/wallet_API.mdx` | substitute / add NEW |
| polling interval by network name | `website/src/scripts/rpc-block-controller.ts` | substitute |

## C — Semantic / historical (decide per hit)

| Pattern | Rule |
|---|---|
| Feature gates `protocol === Protocols.<OLD> \|\| …`, `is<P>OrLater` | remove OLD from the list, ensure NEW (and Alpha) present, update the comment; keep the identifier when it means "introduced in P" |
| `<p>Cases`, `introduced in <P>` | keep (semantic); flag only if the feature was reworked |
| Doc claims: "`… in <P> protocol`" (cycle length, block time), docs links `…/docs/<p>/…`, `gitlab.io/<p>/…`, `…/<p>-mempool-openapi-rc.json` | rewrite to NEW **only after** verifying against mainnet constants / that the NEW URL returns 200; else flag |
| `// protocol constants in <P> Protocol` (`ORIGINATION_SIZE`, `COST_PER_BYTE`) | verify value on NEW mainnet via RPC constants, then relabel |
| "value is based on octez-client reveal … in <P> Protocol" (reveal gas/fee/storage tables) | measured, not derivable by grep. **Do not relabel without re-measuring** → "Needs a human" |
| Comments describing a past incident ("`<P>` -> `<Q>` broke this file") | keep (history) |
| Estimation baselines keyed `[Protocols.<OLD>]` | OLD key: delete only if no live lane still reports it; NEW key must be recorded from real runs → flag, never copy |

## D — Never touch

| Pattern | Why |
|---|---|
| `Protocols.<OLDHASH>` enum entries and `'<hash>': NN` maps (local-forging `protocols.ts`, michel-codec `michelson-types.ts`, octez.js `constants.ts`) | protocol registry; forging/parsing of older chains still needs them |
| `ConstantsResponseProtoNNN` types in `octez.js-rpc` | inheritance chain (`ProtoNNN+1 extends ProtoNNN`) |
| `proto.NNN-<hash7>.…` error ids in `*.spec.ts`; `contracts_NNN.spec.ts`; protocol-ordering test | recorded fixtures / ordering assertions |
| `website/src/pages/changelog.mdx` | release history; add a *new* entry for the rotation only if asked |
| `website/src/content/docs/<anything but next>/`, `website/versioned_docs*` | frozen snapshots |
| `.github/workflows/*` | CI lane choices belong to maintainers (report) |
| `package-lock.json` | generated |
| anything under `taquito/*` `website/` | licensing hard stop |

## Lessons log

(Append here when the Phase 4 sweep catches a pattern missing from the tables above.)

- 2026-10 Tallinn → Ushuaia: name-only grep missed hash/number tokens; `ChainIds` (not `NetworkType`)
  is the chain-id enum in `octez.js/src/constants.ts`; reveal gas/fee comments cannot be relabeled without
  re-measurement; testnet cycle constants (300 blocks/4 s on ushuaianet) differ from mainnet (14400/6 s) —
  verify doc claims on mainnet, not on the testnet being rotated in.
- 2026-10 Tallinn → Ushuaia (second run): `NetworkType` in wallet-connect had no NEW entry, so OLD is
  replaced in place (`TALLINNNET` → `USHUAIANET`) and the tests/data (`tezos:<net>:tz…`, error strings)
  are rewritten with it. Docs links `…/docs/<p>/…` and `gitlab.io/<p>/…` can be verified (200 + the
  `id="<anchor>"` present in the HTML), but **GitLab `-/blob/…` URLs return 200 even for bogus files** —
  verify with the API (`/api/v4/projects/tezos%2Ftezos/repository/files/<urlencoded path>?ref=master`);
  a 404 there means flag, don't rewrite. The widened sweep (`tallin`, bare `24`) yields false positives
  ("Installing", "(24 ms)") — allowlist them as `# false positive`. Never `git stash -u` to compare
  against base (it swallows the untracked `briefs/`/`roster/`); use `git worktree add` instead.
- 2026-10 Tallinn → Ushuaia (live verification): the mempool OpenAPI file lost its `-rc` suffix once released
  (`ushuaia-mempool-openapi.json`) — list `docs/api` through the GitLab API instead of guessing names. The
  `next/rpc_nodes_integration_test.mdx` sample drifts from `nodes.spec.ts` (tests removed/renamed), so re-record
  it from a real `--reporter=verbose` run rather than renaming hosts. Reveal constants are `measured + 1–2 gas /
  ≈1 mutez`; they did not move between Tallinn and Ushuaia, so only the comments change. `tz5_account_enable`
  is false on U025 (mainnet and ushuaianet), so tz5 can only be measured on weeklynet (alpha), and
  `RpcEstimateProvider` mis-sizes tz5 ops (trilitech/octez.js#119) — derive its fee from the formula. The full
  integration suite exceeds a 55 min tool timeout with one signer: run it resumably (`run-itests.sh`) and read the
  real exit code (124 = timeout), not the wrapper's "completed" notice. A key exported with `! export` is not
  visible to Bash calls; pass it inline per command and never persist it.
- 2026-10 tz5 fee confirmation: an ML-DSA-44 signed operation is NOT `forged ++ signature`: on alpha the wire is
  `forged ++ 0xFF ++ 0x04 ++ sig[0..2356) ++ sig[2356..2420)` (signature_prefix case + 64-byte suffix; no length
  field), signing blake2b-256(0x03 || forged). Discover such layouts from `GET /describe/…/helpers/preapply/operations`
  and test candidates offline with `POST …/helpers/parse/operations` (`data` excludes the 32-byte branch). A too-low
  fee is accepted into the mempool but never baked, so confirm by waiting for inclusion. Signed wire size 3797
  bytes, not the 3796 first derived from the assumed signature length.
