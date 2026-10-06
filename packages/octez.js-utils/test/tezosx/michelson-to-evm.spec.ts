import {
  InvalidAmountError,
  InvalidContractAddressError,
  InvalidHexStringError,
} from '@tezos-x/octez.js-core';
import {
  buildMichelsonToEvmCall,
  toTransferParams,
  weiToMutezExact,
} from '../../src/tezosx/michelson-to-evm';
import { NAC_GATEWAY } from '../../src/tezosx/constants';
import {
  InvalidEvmAddressError,
  InvalidMethodSignatureError,
  MissingCalldataError,
  SelectorMismatchError,
  SubMutezPrecisionError,
  UnknownSelectorError,
  UnsafeMutezAmountError,
} from '../../src/tezosx/errors';

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

  it('wraps a bare transfer into the gateway %call entrypoint', () => {
    // 0x38d7ea4c68000 = 1e15 wei = 1000 mutez
    const call = buildMichelsonToEvmCall({ to: TO, value: '0x38d7ea4c68000' });
    expect(call).toEqual({
      direction: 'michelson-to-evm',
      contractAddress: NAC_GATEWAY,
      entrypoint: 'call',
      mutezAmount: 1000n,
      parameter: {
        prim: 'Pair',
        args: [
          { string: `http://ethereum/${TO}` },
          {
            prim: 'Pair',
            args: [
              [],
              {
                prim: 'Pair',
                args: [{ bytes: '' }, { prim: 'Pair', args: [{ int: '1' }, { prim: 'None' }] }],
              },
            ],
          },
        ],
      },
    });
  });

  it('accepts the value as a bigint, a number, a decimal string or a hex string', () => {
    for (const value of [10n ** 15n, 10 ** 15, '1000000000000000', '0x38d7ea4c68000']) {
      expect(buildMichelsonToEvmCall({ to: TO, value }).mutezAmount).toBe(1000n);
    }
  });

  it('rejects values that are not non-negative integers with InvalidAmountError', () => {
    for (const value of ['1.5', '', ' 1', '-1', 1.5, -1, 2 ** 60, NaN]) {
      expect(() => buildMichelsonToEvmCall({ to: TO, value })).toThrow(InvalidAmountError);
    }
  });

  it('rejects a methodSignature without calldata', () => {
    expect(() => buildMichelsonToEvmCall({ to: TO, methodSignature: 'foo()' })).toThrow(
      MissingCalldataError
    );
  });

  it('defaults to 0 mutez and treats "0x" calldata as a bare transfer', () => {
    const call = buildMichelsonToEvmCall({ to: TO, data: '0x' });
    expect(call.mutezAmount).toBe(0n);
    expect(call.entrypoint).toBe('call');
    expect(call.methodSignature).toBeUndefined();
  });

  it('rejects sub-mutez precision instead of flooring it away', () => {
    expect(() => buildMichelsonToEvmCall({ to: TO, value: 1n })).toThrow(SubMutezPrecisionError);
    // 1 mutez + 1 wei
    expect(() => buildMichelsonToEvmCall({ to: TO, value: 10n ** 12n + 1n })).toThrow(
      SubMutezPrecisionError
    );
  });

  it('wraps a known method into the gateway %call_evm entrypoint', () => {
    const call = buildMichelsonToEvmCall({ to: TO, data: ERC20_TRANSFER });
    expect(call.entrypoint).toBe('call_evm');
    expect(call.methodSignature).toBe('transfer(address,uint256)');
    expect(call.parameter).toEqual({
      prim: 'Pair',
      args: [
        { string: TO },
        {
          prim: 'Pair',
          args: [
            { string: 'transfer(address,uint256)' },
            {
              prim: 'Pair',
              args: [{ bytes: '11'.repeat(32) + '00'.repeat(32) }, { prim: 'None' }],
            },
          ],
        },
      ],
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

  it('rejects an unknown selector', () => {
    const error = (() => {
      try {
        buildMichelsonToEvmCall({ to: TO, data: '0xdeadbeef' });
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(UnknownSelectorError);
    expect((error as UnknownSelectorError).selector).toBe('deadbeef');
  });

  it('resolves the selector with the given known signatures', () => {
    // keccak256("foo()")[0..4] = c2985578
    const call = buildMichelsonToEvmCall(
      { to: TO, data: '0xc2985578' },
      { knownSignatures: { c2985578: 'function foo() returns (bool)' } }
    );
    expect(call.methodSignature).toBe('foo()');
  });

  it('matches known signature keys regardless of case and 0x prefix', () => {
    for (const key of ['C2985578', '0xc2985578', '0xC2985578']) {
      const call = buildMichelsonToEvmCall(
        { to: TO, data: '0xc2985578' },
        { knownSignatures: { [key]: 'foo()' } }
      );
      expect(call.methodSignature).toBe('foo()');
    }
  });

  it('rejects a known signature that does not match its selector', () => {
    expect(() =>
      buildMichelsonToEvmCall(
        { to: TO, data: '0xdeadbeef' },
        { knownSignatures: { deadbeef: 'foo()' } }
      )
    ).toThrow(SelectorMismatchError);
  });

  it('accepts a methodSignature matching the calldata selector', () => {
    // keccak256("mint(address,uint256)")[0..4] = 40c10f19
    const call = buildMichelsonToEvmCall({
      to: TO,
      data: '0x40c10f19' + '00'.repeat(64),
      methodSignature: 'mint(address,uint256)',
    });
    expect(call.methodSignature).toBe('mint(address,uint256)');
  });

  it('sends the canonical form of a methodSignature to the gateway', () => {
    for (const methodSignature of [
      'function transfer(address to, uint256 amount)',
      ' transfer(address, uint) ',
    ]) {
      const call = buildMichelsonToEvmCall({ to: TO, data: ERC20_TRANSFER, methodSignature });
      expect(call.methodSignature).toBe('transfer(address,uint256)');
      expect(JSON.stringify(call.parameter)).toContain('{"string":"transfer(address,uint256)"}');
      expect(JSON.stringify(call.parameter)).not.toContain(methodSignature);
    }
  });

  it('rejects a methodSignature that is not an ABI function signature', () => {
    for (const methodSignature of ['transfer(address,uint256', 'event Transfer(address,uint256)']) {
      expect(() =>
        buildMichelsonToEvmCall({ to: TO, data: ERC20_TRANSFER, methodSignature })
      ).toThrow(InvalidMethodSignatureError);
    }
  });

  it('rejects a methodSignature that does not match the calldata selector', () => {
    expect(() =>
      buildMichelsonToEvmCall({
        to: TO,
        data: ERC20_TRANSFER,
        methodSignature: 'approve(address,uint256)',
      })
    ).toThrow(SelectorMismatchError);
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

describe('weiToMutezExact', () => {
  it('converts whole mutez amounts', () => {
    expect(weiToMutezExact(0n)).toBe(0n);
    expect(weiToMutezExact(3n * 10n ** 12n)).toBe(3n);
  });

  it('rejects negative amounts', () => {
    expect(() => weiToMutezExact(-(10n ** 12n))).toThrow(InvalidAmountError);
  });
});

describe('toTransferParams', () => {
  it('builds transfer parameters for the gateway call', () => {
    const call = buildMichelsonToEvmCall({ to: TO, value: 10n ** 15n });
    const params = toTransferParams(call);
    expect(params).toEqual({
      to: NAC_GATEWAY,
      amount: 1000,
      mutez: true,
      parameter: { entrypoint: 'call', value: call.parameter },
    });
  });

  it('rejects amounts that do not fit in a JavaScript number', () => {
    const call = buildMichelsonToEvmCall({ to: TO });
    expect(() =>
      toTransferParams({ ...call, mutezAmount: BigInt(Number.MAX_SAFE_INTEGER) + 1n })
    ).toThrow(UnsafeMutezAmountError);
  });
});
