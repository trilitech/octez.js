import { toCanonicalSignature } from '../../src/tezosx/method-signature';
import { InvalidMethodSignatureError } from '../../src/tezosx/errors';

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
