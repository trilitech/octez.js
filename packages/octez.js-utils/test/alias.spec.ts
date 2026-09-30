import { b58Encode, getEthereumAlias, PrefixV2 } from '../src/octez.js-utils';
import { InvalidAddressError, ValidationResult } from '@tezos-x/octez.js-core';

describe('getEthereumAlias', () => {
  it('Should compute the alias of an implicit address', () => {
    expect(getEthereumAlias('tz1KqTpEZ7Yob7QbPE4Hy4Wo8fHG8LhKxZSx')).toEqual(
      '0xccef676171871a48bbd6e2be75bbcc09d38830c5'
    );
  });

  it('Should compute the alias of an originated address', () => {
    expect(getEthereumAlias('KT1Uik8kf8QBs4JoFCbeJBVaEwozebEjoEXQ')).toEqual(
      '0x9ae7fe293cbb7c039fd4139295f60fd945d99b5c'
    );
  });

  it('Should accept every implicit address kind', () => {
    [
      'tz1gvF4cD2dDtqitL3ZTraggSR1Mju2BKFEM',
      'tz2MVED1t9Jery77Bwm1m5YhUx8Wp5KWWRQe',
      'tz3Nk25g51knuzFZZz2DeA5PveaQYmCtV68B',
      'tz4HQ8VeXAyrZMhES1qLMJAc9uAVXjbMpS8u',
      b58Encode(new Uint8Array(20), PrefixV2.MLDSA44PublicKeyHash),
    ].forEach((address) => expect(getEthereumAlias(address)).toMatch(/^0x[0-9a-f]{40}$/));
  });

  it('Should reject an address with an entrypoint', () => {
    expect(() => getEthereumAlias('KT1Uik8kf8QBs4JoFCbeJBVaEwozebEjoEXQ%default')).toThrow(
      InvalidAddressError
    );
  });

  it('Should reject a smart rollup address', () => {
    expect(() => getEthereumAlias('sr1Ghq66tYK9y3r8CC1Tf8i8m5nxh8nTvZEf')).toThrow(
      expect.objectContaining({
        name: 'InvalidAddressError',
        result: ValidationResult.PREFIX_NOT_ALLOWED,
      })
    );
  });

  it('Should reject an address with a bad checksum', () => {
    expect(() => getEthereumAlias('tz1KqTpEZ7Yob7QbPE4Hy4Wo8fHG8LhKxZSy')).toThrow(
      expect.objectContaining({
        name: 'InvalidAddressError',
        result: ValidationResult.INVALID_CHECKSUM,
      })
    );
  });

  it('Should reject an Ethereum address', () => {
    expect(() => getEthereumAlias('0xccef676171871a48bbd6e2be75bbcc09d38830c5')).toThrow(
      InvalidAddressError
    );
  });
});
