import type { RNG } from '@tezos-x/octez.js-timelock';

/**
 * A deterministic, non-cryptographic RNG for tests that must be exactly
 * reproducible run to run (e.g. VDF-based timelock chest/key generation).
 *
 * mulberry32: small, fast, and well-distributed enough for test fixtures --
 * not appropriate for anything security-sensitive, which is why this lives in
 * integration-tests/test-helpers rather than a published package.
 */
export function makeSeededRng(seed: number): RNG {
  let state = seed >>> 0;

  function nextUint32(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  return {
    getRandomValues(array: Uint8Array): Uint8Array {
      for (let i = 0; i < array.length; i += 4) {
        const word = nextUint32();
        array[i] = word & 0xff;
        if (i + 1 < array.length) array[i + 1] = (word >>> 8) & 0xff;
        if (i + 2 < array.length) array[i + 2] = (word >>> 16) & 0xff;
        if (i + 3 < array.length) array[i + 3] = (word >>> 24) & 0xff;
      }
      return array;
    },
  };
}
