import { InvalidAmountError } from '@tezos-x/octez.js-core';
import { parseAmount } from '../../src/tezosx/amount';

describe('parseAmount', () => {
  it('accepts a bigint, a safe integer number, a decimal string or a hex string', () => {
    for (const amount of [1000n, 1000, '1000', '0x3e8', '0x3E8']) {
      expect(parseAmount(amount)).toBe(1000n);
    }
    expect(parseAmount(0)).toBe(0n);
    expect(parseAmount(2n ** 100n)).toBe(2n ** 100n);
  });

  it('rejects amounts that are not non-negative integers', () => {
    for (const amount of [
      -1n,
      -1,
      1.5,
      2 ** 60,
      NaN,
      Infinity,
      '1.5',
      '',
      ' 1',
      '-1',
      '1e3',
      '0x',
    ]) {
      expect(() => parseAmount(amount)).toThrow(InvalidAmountError);
    }
  });
});
