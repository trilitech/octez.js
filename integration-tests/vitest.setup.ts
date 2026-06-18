import BigNumber from 'bignumber.js';
import { initSapling } from '@tezos-x/octez.js-sapling';

// BigNumber instances created in different module contexts (e.g. inside
// @tezos-x/octez.js-sapling vs. the test file) have different constructors, so
// Vitest's structural toEqual fails even when the values are identical.
// This tester delegates to BigNumber.isEqualTo which compares by value.
expect.addEqualityTesters([
  function bigNumberEquals(a: unknown, b: unknown): boolean | undefined {
    const aIsBN = BigNumber.isBigNumber(a);
    const bIsBN = BigNumber.isBigNumber(b);
    if (aIsBN && bIsBN) {
      return (a as BigNumber).isEqualTo(b as BigNumber);
    }
    if (aIsBN || bIsBN) {
      // one side is BN and the other isn't; definitely not equal
      return false;
    }
    // not our problem, let the default tester handle it
    return undefined;
  },
]);

// If the CI job pre-downloaded the sapling params to disk, wire them up so
// tests use local files instead of downloading 48 MB mid-step.
const spendPath = process.env['SAPLING_SPEND_PARAMS_PATH'];
const outputPath = process.env['SAPLING_OUTPUT_PARAMS_PATH'];
if (spendPath && outputPath) {
  void initSapling({ params: { spendParamsPath: spendPath, outputParamsPath: outputPath } });
}
