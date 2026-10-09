import { toFunctionSelector } from 'viem';
import {
  DEFAULT_KNOWN_SIGNATURES,
  resolveCalldataSignature,
  toCanonicalSignature,
} from '../../src/tezosx/method-signature';
import {
  InvalidMethodSignatureError,
  SelectorMismatchError,
  UnknownSelectorError,
} from '../../src/tezosx/errors';

describe('toCanonicalSignature', () => {
  it('returns the canonical form of an ABI function signature', () => {
    for (const methodSignature of [
      'transfer(address,uint256)',
      'function transfer(address to, uint256 amount)',
      ' transfer(address, uint) ',
      'function transfer(address,uint256) returns (bool)',
    ]) {
      expect(toCanonicalSignature(methodSignature)).toBe('transfer(address,uint256)');
    }
    expect(toCanonicalSignature('increment()')).toBe('increment()');
    expect(toCanonicalSignature('function foo((uint256 a, address b)[] x, int y)')).toBe(
      'foo((uint256,address)[],int256)'
    );
  });

  it('rejects strings that are not ABI function signatures', () => {
    for (const methodSignature of [
      'transfer(address,uint256',
      'event Transfer(address,uint256)',
      'garbage',
      '',
    ]) {
      expect(() => toCanonicalSignature(methodSignature)).toThrow(InvalidMethodSignatureError);
    }
  });
});

describe('DEFAULT_KNOWN_SIGNATURES', () => {
  it('indexes canonical signatures by their selector', () => {
    for (const [selector, signature] of Object.entries(DEFAULT_KNOWN_SIGNATURES)) {
      expect(toFunctionSelector(signature)).toBe(`0x${selector}`);
      expect(toCanonicalSignature(signature)).toBe(signature);
    }
  });
});

describe('resolveCalldataSignature', () => {
  // keccak256("foo()")[0..4] = c2985578
  const FOO = 'c2985578';

  it('returns the canonical form of a given signature matching the selector', () => {
    expect(
      resolveCalldataSignature('a9059cbb', 'function transfer(address to, uint amount)', {})
    ).toBe('transfer(address,uint256)');
    // keccak256("mint(address,uint256)")[0..4] = 40c10f19
    expect(resolveCalldataSignature('40c10f19', 'mint(address,uint256)', {})).toBe(
      'mint(address,uint256)'
    );
  });

  it('rejects a given signature that does not match the selector', () => {
    expect(() => resolveCalldataSignature('a9059cbb', 'approve(address,uint256)', {})).toThrow(
      SelectorMismatchError
    );
  });

  it('prefers the given signature over the known signatures', () => {
    expect(resolveCalldataSignature(FOO, 'foo()', { [FOO]: 'bar()' })).toBe('foo()');
  });

  it('looks the selector up in the known signatures, regardless of key case and 0x', () => {
    for (const key of [FOO, 'C2985578', '0xc2985578', '0xC2985578']) {
      expect(
        resolveCalldataSignature(FOO, undefined, { [key]: 'function foo() returns (bool)' })
      ).toBe('foo()');
    }
    expect(resolveCalldataSignature('a9059cbb', undefined, DEFAULT_KNOWN_SIGNATURES)).toBe(
      'transfer(address,uint256)'
    );
  });

  it('rejects a known signature that does not match its selector', () => {
    expect(() => resolveCalldataSignature('deadbeef', undefined, { deadbeef: 'foo()' })).toThrow(
      SelectorMismatchError
    );
  });

  it('rejects an unknown selector', () => {
    const error = (() => {
      try {
        resolveCalldataSignature('deadbeef', undefined, DEFAULT_KNOWN_SIGNATURES);
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(UnknownSelectorError);
    expect((error as UnknownSelectorError).selector).toBe('deadbeef');
  });

  it('rejects a signature that is not an ABI function signature', () => {
    expect(() => resolveCalldataSignature('a9059cbb', 'transfer(address,uint256', {})).toThrow(
      InvalidMethodSignatureError
    );
  });
});
