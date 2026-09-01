## Sapling Parameter Provenance

octez.js now treats the Sapling proving parameters as immutable release artifacts served from the Nomadic-hosted mirror at `https://storage.googleapis.com/tezos-linux-repo/octez-js/sapling`, not as vendored package payloads.

Original source:
- `https://download.z.cash/downloads/sapling-spend.params`
- `https://download.z.cash/downloads/sapling-output.params`

Hosted release paths:
- `https://storage.googleapis.com/tezos-linux-repo/octez-js/sapling/groth16-mainnet-1/spend.params`
- `https://storage.googleapis.com/tezos-linux-repo/octez-js/sapling/groth16-mainnet-1/output.params`

The mirror holds only the two parameter objects. `https://storage.googleapis.com/tezos-linux-repo/octez-js/sapling/groth16-mainnet-1.json` is not
published: nothing fetches a manifest at runtime — `src/sapling-params-loader.ts` imports the
pinned manifest from this package instead.

Pinned verification data:
- `sapling-spend.params`
  - Size: `47,958,396` bytes
  - SHA-256: `8e48ffd23abb3a5fd9c5589204f32d9c31285a04b78096ba40a79b75677efc13`
- `sapling-output.params`
  - Size: `3,592,860` bytes
  - SHA-256: `2f0ebbcbb9bb0bcffe95a397e7eba89c29eb4dde6191c339db88570e3f3fb0e4`

Release source of truth:
- the pinned manifest lives in `src/sapling-params-manifest.json`
- `src/sapling-params-loader.ts` imports that manifest for the default runtime URLs and digests
- `prepare-sapling-release-artifacts.js` emits the exact upload set for the current parameter version

Operational note:
- upload only immutable, versioned objects
- verify the public bytes against the pinned hashes after upload
- the mirror is a GCS bucket (`gs://tezos-linux-repo`, project `nl-gitlab-runner`), whose
  objects are world-readable; uploads are verified against the pinned hashes over the public
  URL after upload
- `docs/infra/sapling-cloudflare-r2-rollout.md` describes the earlier Cloudflare R2 plan and
  no longer matches where the parameters are hosted
