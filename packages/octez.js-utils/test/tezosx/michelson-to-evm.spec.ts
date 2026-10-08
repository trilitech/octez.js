import {
  InvalidAmountError,
  InvalidContractAddressError,
  InvalidHexStringError,
} from '@tezos-x/octez.js-core';
import { buildMichelsonToEvmCall } from '../../src/tezosx/michelson-to-evm';
import { NAC_GATEWAY } from '../../src/tezosx/constants';
import {
  InvalidEvmAddressError,
  InvalidMethodSignatureError,
  MissingCalldataError,
  SelectorMismatchError,
  SubMutezPrecisionError,
  UnknownSelectorError,
} from '../../src/tezosx/errors';
import { buildCallEvmParameter, buildHttpCallParameter } from '../../src/tezosx/gateway-parameters';

const TO = '0xdeAD000000000000000042000000000000000000';
const ERC20_TRANSFER = '0xa9059cbb' + '11'.repeat(32) + '00'.repeat(32);

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

  it('treats empty calldata as a native transfer', () => {
    for (const data of ['', '0x']) {
      const call = buildMichelsonToEvmCall({ to: TO, data });
      expect(call.entrypoint).toBe('call');
      expect(call.methodSignature).toBeUndefined();
    }
  });

  it('rejects a methodSignature without calldata', () => {
    expect(() => buildMichelsonToEvmCall({ to: TO, methodSignature: 'foo()' })).toThrow(
      MissingCalldataError
    );
  });

  it('wraps a known method into the gateway %call_evm entrypoint', () => {
    const call = buildMichelsonToEvmCall({ to: TO, value: 10n ** 12n, data: ERC20_TRANSFER });
    expect(call).toEqual({
      direction: 'michelson-to-evm',
      contractAddress: NAC_GATEWAY,
      entrypoint: 'call_evm',
      mutezAmount: 1n,
      methodSignature: 'transfer(address,uint256)',
      parameter: buildCallEvmParameter(
        TO,
        'transfer(address,uint256)',
        '11'.repeat(32) + '00'.repeat(32),
        { prim: 'None' }
      ),
    });
  });

  it('uses the given callback', () => {
    const callback = { prim: 'Some', args: [{ string: 'KT1…' }] };
    const call = buildMichelsonToEvmCall({ to: TO, data: ERC20_TRANSFER }, { callback });
    expect(JSON.stringify(call.parameter)).toContain(JSON.stringify(callback));
  });

  it('rejects calldata that is not an even-length hex string', () => {
    for (const data of ['0xa9059cbbzz1', '0xa9059cbb1', 'not hex']) {
      expect(() => buildMichelsonToEvmCall({ to: TO, data })).toThrow(InvalidHexStringError);
    }
  });

  it('rejects non-empty calldata shorter than a function selector', () => {
    expect(() => buildMichelsonToEvmCall({ to: TO, data: '0xa905' })).toThrow(
      InvalidHexStringError
    );
  });

  it('accepts calldata without the 0x prefix and in upper case', () => {
    const call = buildMichelsonToEvmCall({ to: TO, data: ERC20_TRANSFER.slice(2).toUpperCase() });
    expect(call.methodSignature).toBe('transfer(address,uint256)');
  });

  it('sends the canonical form of a methodSignature to the gateway', () => {
    const methodSignature = 'function transfer(address to, uint amount)';
    const call = buildMichelsonToEvmCall({ to: TO, data: ERC20_TRANSFER, methodSignature });
    expect(call.methodSignature).toBe('transfer(address,uint256)');
    expect(JSON.stringify(call.parameter)).toContain('{"string":"transfer(address,uint256)"}');
    expect(JSON.stringify(call.parameter)).not.toContain(methodSignature);
  });

  it('resolves the selector with the given known signatures', () => {
    // keccak256("foo()")[0..4] = c2985578
    const call = buildMichelsonToEvmCall(
      { to: TO, data: '0xc2985578' },
      { knownSignatures: { '0xC2985578': 'foo()' } }
    );
    expect(call.methodSignature).toBe('foo()');
  });

  it('rejects calls whose method signature cannot be resolved or checked', () => {
    expect(() => buildMichelsonToEvmCall({ to: TO, data: '0xdeadbeef' })).toThrow(
      UnknownSelectorError
    );
    expect(() =>
      buildMichelsonToEvmCall({
        to: TO,
        data: ERC20_TRANSFER,
        methodSignature: 'approve(address,uint256)',
      })
    ).toThrow(SelectorMismatchError);
    expect(() =>
      buildMichelsonToEvmCall({ to: TO, data: ERC20_TRANSFER, methodSignature: 'transfer(' })
    ).toThrow(InvalidMethodSignatureError);
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
