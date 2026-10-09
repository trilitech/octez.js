import { InvalidHexStringError } from '@tezos-x/octez.js-core';
import { parseHexBytes } from '../../src/tezosx/hex';

describe('parseHexBytes', () => {
  it('returns the bytes lowercased, without the 0x prefix', () => {
    expect(parseHexBytes('0xABcd')).toBe('abcd');
    expect(parseHexBytes('abcd')).toBe('abcd');
    expect(parseHexBytes('0x')).toBe('');
    expect(parseHexBytes('')).toBe('');
  });

  it('rejects strings that are not even-length hex strings', () => {
    for (const hex of ['0xa9059cbbzz1', 'abc', '0x0', 'not hex', '0x 00']) {
      expect(() => parseHexBytes(hex)).toThrow(InvalidHexStringError);
    }
  });

  it('enforces a minimum number of bytes', () => {
    expect(parseHexBytes('0x00', 1)).toBe('00');
    expect(() => parseHexBytes('0x', 1)).toThrow(InvalidHexStringError);
    expect(() => parseHexBytes('0xa905', 4)).toThrow(InvalidHexStringError);
  });
});
