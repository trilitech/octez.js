import { createRequire } from 'node:module';

// Import installed packages with Node's default globals, without a DOM shim.
export default async function ({ assert, load }) {
  assert.equal(typeof globalThis.window, 'undefined');
  const require = createRequire(import.meta.url);
  for (const name of ['@tezos-x/octez.js-dapp-wallet', '@tezos-x/octez.js-dapp-wallet/types']) {
    const commonjs = require(name);
    const loaded = await load(name);
    for (const key of Object.keys(commonjs)) {
      assert.equal(loaded[key], commonjs[key], `${name} changed named export ${key}`);
    }
  }
  const { BeaconWallet } = await load('@tezos-x/octez.js-dapp-wallet');
  const { NetworkType, SigningType } = await load('@tezos-x/octez.js-dapp-wallet/types');
  assert.equal(typeof BeaconWallet, 'function');
  assert.equal(NetworkType.MAINNET, 'mainnet');
  assert.equal(SigningType.RAW, 'raw');
}
