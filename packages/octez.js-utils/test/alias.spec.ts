import { b58Encode, getEthereumAlias, getTezosAlias, PrefixV2 } from '../src/octez.js-utils';
import { InvalidAddressError, ValidationResult } from '@tezos-x/octez.js-core';

describe('getEthereumAlias', () => {
  it('Should compute the recoverable alias of a tz1, tz2 or tz3 address', () => {
    // Vectors from trilitech/tz-alias-recovery artifacts/frozen.json (RFC-26051)
    [
      ['tz1aygVpocoeEMU89vXk92sMHqPYFNZVgvrh', '0x04e9ba988ba87bbd7b75e5aa813c52ca3c31e9ae'],
      ['tz1WDRuEornRTSHFTgnwC5LPRQThxbZqofiF', '0xfc997539476b344a3e6fff32aedfe7f70b944079'],
      ['tz1cgbBXC99Tkv26pxXDcFExd5agYtJKp6Ko', '0xd493383ef3e54f84e21f25c610a5abc2137074db'],
      ['tz1cEFKy9mT7yfTZX9yAGn4ZiFC77wxf5WC3', '0x0be2acc9919c7b9b7bff50bbd0621ba819c49f4c'],
      ['tz2BCeQSi5ETyKJsob61pWCoQvoGtsrJBEt2', '0x87823d019d057c7645ce9b403c2149ae512d78e0'],
      ['tz2DQNNCg1zbmNEMbYFK9sn1JakSkdkGy525', '0xc774d8d2245c77dc9598bd739d8ceca40ee8c982'],
      ['tz2RteZE6H6r4YSX7PwHDiEodx1j365BS6Zw', '0x8fefd6010c630095f25ba704e5429d7dcf68d196'],
      ['tz2Cv1duW3gb9j6yV4u3CzqkbrH2XYQuacu3', '0xb844a4a05735a13fb7d6d9a9641d1e28c043a9a2'],
      ['tz3bqAfFRnSA6dfPRG8XR6MBMmo6HZTTG44V', '0x76842c0a2a079aed35ccfc7d1fdda15596094a96'],
      ['tz3UddKLx4bhUxev77uHWuy9UqDk1VHeDpfQ', '0x87fa76396789e17722f48fe735001591a0ae7a54'],
      ['tz3bxdqRaqmfQ8V8aNPtJC3sg29GKMtAxSo4', '0x1fc77b46644ce33b3bb95f962358bd88582a4b4f'],
      ['tz3N5sNfWMwWLiUC65vH43rpHKDNYLGyrEnc', '0xe680afa7dca95810a3f1f0b90faa412e5c1146af'],
      ['tz1aAdmy1MiGhnRkw8RWS6xbUpTuSRh3ZB4y', '0xf20dc8cfe3ab395547d9d702e2d1efb6378e38a6'],
      ['tz2K1exM7pLKyUtVTKqtDo6zFwv98trFxqBc', '0xa01485dafd78651e8b73e5f202669d0270e918df'],
    ].forEach(([address, alias]) => expect(getEthereumAlias(address)).toEqual(alias));
  });

  it('Should compute the hash-based alias of a tz4 address', () => {
    expect(getEthereumAlias('tz4HQ8VeXAyrZMhES1qLMJAc9uAVXjbMpS8u')).toEqual(
      '0xa8e51b1cffe60538fadd7e3ab1d0412458cc2849'
    );
  });

  it('Should compute the hash-based alias of an originated address', () => {
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

describe('getTezosAlias', () => {
  it('Should compute the alias of an Ethereum address', () => {
    expect(getTezosAlias('0xccef676171871a48bbd6e2be75bbcc09d38830c5')).toEqual(
      'KT1TLraR9PboPAvxLKYQs9eU4n75rGFJTbWk'
    );
  });

  it('Should ignore letter case, as the node lowercases the address', () => {
    expect(getTezosAlias('0xCCEF676171871A48BBD6E2BE75BBCC09D38830C5')).toEqual(
      'KT1TLraR9PboPAvxLKYQs9eU4n75rGFJTbWk'
    );
    expect(getTezosAlias('0xCcEf676171871a48bBD6e2be75BbCC09d38830C5')).toEqual(
      'KT1TLraR9PboPAvxLKYQs9eU4n75rGFJTbWk'
    );
  });

  it('Should reject malformed Ethereum addresses', () => {
    [
      'ccef676171871a48bbd6e2be75bbcc09d38830c5',
      '0xccef676171871a48bbd6e2be75bbcc09d38830',
      '0xccef676171871a48bbd6e2be75bbcc09d38830c5ff',
      '0xzcef676171871a48bbd6e2be75bbcc09d38830c5',
      'tz1KqTpEZ7Yob7QbPE4Hy4Wo8fHG8LhKxZSx',
      '',
    ].forEach((address) => expect(() => getTezosAlias(address)).toThrow(InvalidAddressError));
  });
});
