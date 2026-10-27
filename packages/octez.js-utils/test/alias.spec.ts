import { b58Encode, getEthereumAlias, getTezosAlias, PrefixV2 } from '../src/octez.js-utils';
import { InvalidAddressError, ValidationResult } from '@tezos-x/octez.js-core';

describe('getEthereumAlias', () => {
  it('Should compute the recoverable alias of a tz1, tz2 or tz3 address', () => {
    // Vectors from trilitech/tz-alias-recovery artifacts/frozen.json (RFC-26051)
    [
      ['tz1aygVpocoeEMU89vXk92sMHqPYFNZVgvrh', '0x0ea7865238580e0d8f0d2ca196d3b672dea705ad'],
      ['tz1WDRuEornRTSHFTgnwC5LPRQThxbZqofiF', '0x1975f732fea2a37de36e40017b907d6562ffce7d'],
      ['tz1cgbBXC99Tkv26pxXDcFExd5agYtJKp6Ko', '0xcd9737deee8444f5c277bee986586de00b5b5d2b'],
      ['tz1cEFKy9mT7yfTZX9yAGn4ZiFC77wxf5WC3', '0xf45fb97fc5d9785f1075bf86e050c608b601faaf'],
      ['tz2BCeQSi5ETyKJsob61pWCoQvoGtsrJBEt2', '0x29dd12971b4b7f5741334ab0cd72fe9706e2e2cd'],
      ['tz2DQNNCg1zbmNEMbYFK9sn1JakSkdkGy525', '0x3915cb0424fa0a7f08cf4f78aa9a6910177272b1'],
      ['tz2RteZE6H6r4YSX7PwHDiEodx1j365BS6Zw', '0x78cd291942fdd47a55cea942adbdc35782f1a254'],
      ['tz2Cv1duW3gb9j6yV4u3CzqkbrH2XYQuacu3', '0x3fdbb367414d2426d2549fa4f5429623d3c19c52'],
      ['tz3bqAfFRnSA6dfPRG8XR6MBMmo6HZTTG44V', '0xc75658fcee30564ffda5e61c48cdebd47eb0633e'],
      ['tz3UddKLx4bhUxev77uHWuy9UqDk1VHeDpfQ', '0x3ea387c764b0d48b8416e19a5d68d0219b9c13dd'],
      ['tz3bxdqRaqmfQ8V8aNPtJC3sg29GKMtAxSo4', '0xbc46edf18e7c5d62ae88c8796a490c491cccdda2'],
      ['tz3N5sNfWMwWLiUC65vH43rpHKDNYLGyrEnc', '0xee9440608815f399d8fd197cd5ead96dbcef288b'],
      ['tz1aAdmy1MiGhnRkw8RWS6xbUpTuSRh3ZB4y', '0xcdb4d002582717fa10060665ec598ac68590072a'],
      ['tz2K1exM7pLKyUtVTKqtDo6zFwv98trFxqBc', '0x40f2c21437e12669dbf98d5035b21c6141c7bb69'],
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
