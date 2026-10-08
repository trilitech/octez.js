import { InvalidAmountError, InvalidContractAddressError } from '@tezos-x/octez.js-core';
import { buildMichelsonToEvmCall } from '../../src/tezosx/michelson-to-evm';
import { NAC_GATEWAY } from '../../src/tezosx/constants';
import { InvalidEvmAddressError, SubMutezPrecisionError } from '../../src/tezosx/errors';
import { buildHttpCallParameter } from '../../src/tezosx/gateway-parameters';

const TO = '0xdeAD000000000000000042000000000000000000';

describe('buildMichelsonToEvmCall', () => {
  it('rejects a destination that is not an EVM address', () => {
    expect(() => buildMichelsonToEvmCall({ to: 'http://evil/../drain' })).toThrow(
      InvalidEvmAddressError
    );
    expect(() => buildMichelsonToEvmCall({ to: '0x1234' })).toThrow(InvalidEvmAddressError);
    expect(() => buildMichelsonToEvmCall({ to: `${TO} ` })).toThrow(InvalidEvmAddressError);
  });

  it('rejects a mixed-case EVM address with an invalid EIP-55 checksum', () => {
    expect(() =>
      buildMichelsonToEvmCall({ to: '0xdEAD000000000000000042000000000000000000' })
    ).toThrow(InvalidEvmAddressError);
    // An all-lowercase address carries no checksum
    expect(buildMichelsonToEvmCall({ to: TO.toLowerCase() }).entrypoint).toBe('call');
  });

  it('wraps a native transfer into the gateway %call entrypoint', () => {
    // 0x38d7ea4c68000 = 1e15 wei = 1000 mutez
    expect(buildMichelsonToEvmCall({ to: TO, value: '0x38d7ea4c68000' })).toEqual({
      direction: 'michelson-to-evm',
      contractAddress: NAC_GATEWAY,
      entrypoint: 'call',
      mutezAmount: 1000n,
      parameter: buildHttpCallParameter(`http://ethereum/${TO}`),
    });
  });

  it('accepts the value as a bigint, a number, a decimal string or a hex string', () => {
    for (const value of [10n ** 15n, 10 ** 15, '1000000000000000', '0x38d7ea4c68000']) {
      expect(buildMichelsonToEvmCall({ to: TO, value }).mutezAmount).toBe(1000n);
    }
  });

  it('defaults to 0 mutez', () => {
    expect(buildMichelsonToEvmCall({ to: TO }).mutezAmount).toBe(0n);
  });

  it('rejects values that are not non-negative integers with InvalidAmountError', () => {
    for (const value of ['1.5', '', ' 1', '-1', 1.5, -1, 2 ** 60, NaN]) {
      expect(() => buildMichelsonToEvmCall({ to: TO, value })).toThrow(InvalidAmountError);
    }
  });

  it('rejects sub-mutez precision instead of flooring it away', () => {
    expect(() => buildMichelsonToEvmCall({ to: TO, value: 1n })).toThrow(SubMutezPrecisionError);
    // 1 mutez + 1 wei
    expect(() => buildMichelsonToEvmCall({ to: TO, value: 10n ** 12n + 1n })).toThrow(
      SubMutezPrecisionError
    );
  });

  it('uses the given gateway address and validates it', () => {
    const gatewayAddress = 'KT1PWx2mnDueood7fEmfbBDKx1D9BAnnXitn';
    expect(buildMichelsonToEvmCall({ to: TO }, { gatewayAddress }).contractAddress).toBe(
      gatewayAddress
    );
    expect(() => buildMichelsonToEvmCall({ to: TO }, { gatewayAddress: 'tz1abc' })).toThrow(
      InvalidContractAddressError
    );
  });
});
