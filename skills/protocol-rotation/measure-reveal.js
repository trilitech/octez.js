#!/usr/bin/env node
// Re-measure the reveal gas/fee/storage constants (packages/octez.js/src/constants.ts)
// on a live lane, using fresh throwaway accounts funded from the testnet key.
//
// Usage (key via env, never written to disk):
//   SECRET_KEY='edsk...' node skills/protocol-rotation/measure-reveal.js <rpc-url>
//   # optional, to measure tz5 (only if tz5_account_enable=true on that lane):
//   MLDSA_DEP=<dir with `npm i @noble/post-quantum`> SECRET_KEY=... node ... <rpc-url>
//
// Prints one JSON line per address type plus the values currently in constants.ts.
// Requires `npm run build` first (it loads the built workspace packages).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = require('child_process').execSync('git rev-parse --show-toplevel').toString().trim();
const pkg = (n) => require(path.join(root, 'packages', n));
const { TezosToolkit } = pkg('octez.js');
const { InMemorySigner } = pkg('octez.js-signer');
const { b58Encode, getPkhfromPk, PrefixV2 } = pkg('octez.js-utils');

const rpcUrl = process.argv[2];
if (!rpcUrl || !process.env.SECRET_KEY) {
  console.error('usage: SECRET_KEY=... node measure-reveal.js <rpc-url>');
  process.exit(2);
}
const FUND_TEZ = 1.5; // enough for a reveal fee, even tz5's ~3.9k mutez

(async () => {
  const main = new TezosToolkit(rpcUrl);
  main.setProvider({ signer: new InMemorySigner(process.env.SECRET_KEY) });

  const constants = await main.rpc.getConstants();
  const src = fs.readFileSync(path.join(root, 'packages/octez.js/src/constants.ts'), 'utf8');
  const stored = (block) =>
    Object.fromEntries(
      [...(src.match(new RegExp(`const ${block} = \\{([\\s\\S]*?)\\};`)) || ['', ''])[1].matchAll(/(TZ\d):\s*(\d+)/g)].map(
        (m) => [m[1], Number(m[2])]
      )
    );
  console.log('stored REVEAL_GAS_LIMIT', JSON.stringify(stored('REVEAL_GAS_LIMIT')));
  console.log('stored REVEAL_FEE      ', JSON.stringify(stored('REVEAL_FEE')));

  const measure = async (label, signer) => {
    const pkh = await signer.publicKeyHash();
    const f = await main.contract.transfer({ to: pkh, amount: FUND_TEZ });
    await f.confirmation(1);
    const T = new TezosToolkit(rpcUrl);
    T.setProvider({ signer });
    const e = await T.estimate.reveal();
    console.log(
      label,
      JSON.stringify({
        pkh,
        gasLimit: e.gasLimit,
        consumedMilligas: e.consumedMilligas,
        storageLimit: e.storageLimit,
        minimalFeeMutez: e.minimalFeeMutez,
        opSize: e.opSize,
      })
    );
  };

  const rand = () => new Uint8Array(crypto.randomBytes(32));
  const types = {
    tz1: PrefixV2.Ed25519Seed,
    tz2: PrefixV2.Secp256k1SecretKey,
    tz3: PrefixV2.P256SecretKey,
    tz4: PrefixV2.BLS12_381SecretKey,
  };
  for (const [label, prefix] of Object.entries(types)) {
    await measure(label, new InMemorySigner(b58Encode(rand(), prefix)));
  }

  if (constants.tz5_account_enable && process.env.MLDSA_DEP) {
    // No ML-DSA signer in the repo: estimation only needs the public key and address.
    const { ml_dsa44 } = require(path.join(process.env.MLDSA_DEP, 'node_modules/@noble/post-quantum/ml-dsa.js'));
    const pk = b58Encode(ml_dsa44.keygen(rand()).publicKey, PrefixV2.MLDSA44PublicKey);
    const pkh = getPkhfromPk(pk);
    await measure('tz5', {
      publicKey: async () => pk,
      publicKeyHash: async () => pkh,
      secretKey: async () => undefined,
      sign: async () => {
        throw new Error('estimate only');
      },
    });
    console.log(
      'NOTE tz5: estimate.opSize/minimalFeeMutez are WRONG for tz5 (trilitech/octez.js#119). ' +
        'Use min fee = 100 + 0.1*gas + 1*size, size = forged reveal bytes + signature bytes.'
    );
  } else {
    console.log(`tz5 skipped (tz5_account_enable=${constants.tz5_account_enable}, MLDSA_DEP ${process.env.MLDSA_DEP ? 'set' : 'unset'})`);
  }
})().catch((e) => {
  console.error('ERR', e.message, e.body ? String(e.body).slice(0, 400) : '');
  process.exit(1);
});
