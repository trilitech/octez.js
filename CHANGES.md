# Changes

Developer changelog for octez.js, kept between releases.

- Every pull request with a user-visible change adds a line under **Unreleased**, in the matching
  section: `- **<package>**: <what changed, for the user> (#<PR>)`.
- **Internal** is for changes no user sees (CI, tests, tooling). These stay out of the public
  release notes.
- At a stable release, write the public release notes (`website/src/pages/changelog.mdx` and the
  GitHub Release) from **Unreleased**. Then rename it to `vX.Y.Z (YYYY-MM-DD)`, drop its empty
  sections, and add a fresh, empty **Unreleased** with the same five sections above it.

Releases up to v25.0.0 are described in the
[release notes](https://octez-js.tezos.com/changelog/).

## Unreleased

### Breaking changes

- **rpc**: `RpcClientInterface` now requires `aggregatePublicKeys`, `checkProof`,
  `aggregateSignatures` and `thresholdSignatures`. Custom RPC client implementations must add them
  to keep compiling; `aggregateProofs` is optional (#160, #161).
- **utils**: `isValidAddress`, `isValidContractAddress`, `isValidPublicKey` and
  `isValidOperationHash` now return the type predicate `value is string` instead of `boolean`.
  Runtime behaviour is unchanged, but an argument already typed `string` is narrowed to `never`
  when the check fails, which can break compilation of code that still uses it there (#160).

### Features

- **octez.js**: wallet API support for smart rollup operations: `smartRollupOriginate`,
  `smartRollupAddMessages` and `smartRollupExecuteOutboxMessage` on `Tezos.wallet`, the matching
  `withSmartRollup*` methods on wallet batches, and `rollupAddress()` on the origination operation
  (#161).
- **dapp-wallet**, **wallet-connect**: map the smart rollup operations above to wallet requests
  (#161).
- **octez.js**: smart rollup origination accepts a `whitelist` of public key hashes for private
  rollups (#161).
- **octez.js**: detached signing. `Tezos.prepareFor(identity)` prepares operations for an account
  whose key is held elsewhere; `toSignable`, `attachSignature` and `inject` carry the operation to
  an external signer and back (#160).
- **octez.js**, **rpc**: paginated big-map value reads: `getValuesPage`, `listValues` and
  `isEmpty` on big-map abstractions (pages of up to 1000 values, 100 by default),
  `getBigMapValuesPageByID`, `listBigMapValuesByID` and `isBigMapEmptyByID` on the contract
  provider, and `RpcClient.getBigMapValuesPage`. Invalid page options throw
  `InvalidBigMapParameterError` (#161).
- **rpc**: BLS shell endpoints: `aggregatePublicKeys`, `checkProof`, `aggregateSignatures`,
  `thresholdSignatures` and `aggregateProofs` (#160, #161).
- **signer**: `provePossession` accepts an aggregate public key to produce a proof of possession
  for it (#161).
- **signer**: BIP39 mnemonic helpers: `generateMnemonic`, `entropyToMnemonic`,
  `mnemonicToEntropy` and `deriveKeyFromMnemonic`, which derives key material without creating a
  signer. `InvalidMnemonicError` is exported (#160).
- **utils**: `getPublicKeyHashFromPublicKey`, a readable alias of `getPkhfromPk` (#160).
- **local-forging**, **ledger-signer**, **octez.js**: more symbols exported from the package
  entry points: local-forging errors and the Michelson codec, ledger-signer errors and helpers,
  and the wallet batch and increase-paid-storage operation classes (#160).
- **sapling**: opt-in randomized output order. `outputOrder: 'randomized'` in the contract details
  makes the default transaction builder shuffle the outputs, private change included, before
  signing, so change is no longer always the last output. The default, `'preserve'`, keeps the
  current order (#164).

### Fixes

- **octez.js**: `setProvider({ rpc })` now also moves the default read provider to the new RPC.
  An explicitly set read provider is left as it is (#160).
- **octez.js**: subscriptions and confirmations recover better from RPC errors: overlapping
  polls no longer cancel a slow block read, failed head and reference-block reads are retried,
  and closing a subscription stops its retries (#160).
- **octez.js**: `PollingSubscribeProvider` polls the head's block hash and fetches the full block
  only when the head changes, which cuts RPC traffic for subscriptions and confirmations (#160).
- **octez.js**: event subscriptions no longer throw on operations without metadata (#160).
- **rpc**: `RpcClientCache` cancels expiry timers when entries are replaced, expire or are
  cleared, so cached entries no longer keep a Node process alive. Failed requests are evicted at
  once instead of staying cached for the whole TTL (#160).
- **http-utils**: native fetch failures in Firefox and WebKit are recognised as transport
  errors and retried like other network failures. An error response whose body cannot be read
  keeps its HTTP status (#160, #161).
- **local-forging**: decoding rejects truncated or out-of-bounds input with
  `OperationDecodingError` instead of reading past the end (#160).
- **michel-codec**: `Parser.parseJSON(null)` throws a descriptive `TypeError` (#160).
- **michelson-encoder**: optional lambdas given as a single-instruction sequence are encoded
  intact (#160).
- **sapling**: memo length is checked in UTF-8 bytes, as the contract counts it, rather than in
  characters. A failure to read the parameter files is reported as a `SaplingParamsError` with
  code `SAPLING_PARAMS_FETCH_FAILED` (#160).
- **timelock**: proof hashing pads integers the way Octez does, so proofs match Octez's (#161).
- **http-utils**: the request timeout now also covers reading the response body, so a server that
  sends headers and then stalls fails with `HttpTimeoutError` instead of hanging. Errors while
  reading a successful body, including JSON parse errors, are thrown as they are, without being
  wrapped or retried (#164).
- **dapp-wallet**: a native Node `import` of the package or of its `/types` subpath now loads the
  CommonJS build, so the package can be imported without a DOM. Using the wallet still needs a
  browser: in plain Node, creating it fails on the missing `localStorage`. `@types/chrome` is now a
  dependency, so consumers type-check the declarations without installing it themselves (#164).

### Dependencies

- **signer**, **utils**: `@noble/curves` 2.4.0 (was 1.x) (#161).
- **signer**, **utils**, **sapling**, **timelock**, **ledger-signer**: `@noble/hashes` 2.4.0
  (#161).
- **signer**, **sapling**: `@scure/bip39` 2.4.0 (#161).
- **signer**, **sapling**, **timelock**: `@stablelib/nacl` 2 (#161).
- **utils**: `bs58check` 4, which ships its own types; `@types/bs58check` is no longer needed
  (#161).

### Internal

- Backport of Taquito `0066d5b7..d24dfebc`, one commit per upstream commit (#160, #161).
- Packages are built with TypeScript 6 (#160).
- CI: Firefox and WebKit runs of the browser HTTP tests (#160), `typecheck:tests` and packed-package
  consumer checks on Node 22 and 24 (#161). `bundle-webpack` runs on Node 22 (#157).
- Integration-test keygen retries HTTP 500, 502, 503 and 504 (#160).
- Website on astro 7 and vite 8 (#157).
- Backport of Taquito `d24dfebc..24d68fb7`, one commit per upstream commit (#164).
- CI: `build-lint-docs-unit` and the http-utils tests also run on Node 26, and the README lists Node
  26 LTS as supported (#164).
