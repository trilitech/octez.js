import { InvalidAmountError } from '@tezos-x/octez.js-core';
import { mutezToWei, parseAmount, weiToMutezExact } from '../../src/tezosx/amount';
import { WEI_PER_MUTEZ } from '../../src/tezosx/constants';
import { SubMutezPrecisionError } from '../../src/tezosx/errors';

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

describe('weiToMutezExact', () => {
  it('converts whole mutez amounts', () => {
    expect(weiToMutezExact(parseAmount(0n))).toBe(0n);
    expect(weiToMutezExact(parseAmount(3n * 10n ** 12n))).toBe(3n);
  });

  it('rejects sub-mutez precision instead of flooring it away', () => {
    const error = (() => {
      try {
        // 1 mutez + 1 wei
        weiToMutezExact(parseAmount(10n ** 12n + 1n));
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(SubMutezPrecisionError);
    expect((error as SubMutezPrecisionError).remainderWei).toBe(1n);
    expect(() => weiToMutezExact(parseAmount(1n))).toThrow(SubMutezPrecisionError);
  });

  it('accepts at most 2^63 - 1 mutez, the Michelson mutez bound', () => {
    const max = 2n ** 63n - 1n;
    expect(weiToMutezExact(parseAmount(max * WEI_PER_MUTEZ))).toBe(max);
    expect(() => weiToMutezExact(parseAmount((max + 1n) * WEI_PER_MUTEZ))).toThrow(
      InvalidAmountError
    );
  });
});

describe('mutezToWei', () => {
  it('converts mutez to wei', () => {
    expect(mutezToWei(parseAmount(0n))).toBe(0n);
    expect(mutezToWei(parseAmount(5n))).toBe(5n * WEI_PER_MUTEZ);
  });

  it('accepts at most 2^63 - 1 mutez, the Michelson mutez bound', () => {
    const max = 2n ** 63n - 1n;
    expect(mutezToWei(parseAmount(max))).toBe(max * WEI_PER_MUTEZ);
    for (const mutez of [max + 1n, 2n ** 256n]) {
      expect(() => mutezToWei(parseAmount(mutez))).toThrow(InvalidAmountError);
    }
  });
});
