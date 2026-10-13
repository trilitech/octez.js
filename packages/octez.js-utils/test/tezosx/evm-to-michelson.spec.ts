import {
  InvalidAddressError,
  InvalidAmountError,
  InvalidContractAddressError,
  InvalidHexStringError,
} from '@tezos-x/octez.js-core';
import { decodeFunctionData } from 'viem';
import { buildEvmToMichelsonCall } from '../../src/tezosx/evm-to-michelson';
import { NAC_PRECOMPILE_ABI } from '../../src/tezosx/abi';
import {
  NAC_PRECOMPILE_ADDRESS,
  NAC_RECOMMENDED_GAS,
  WEI_PER_MUTEZ,
} from '../../src/tezosx/constants';
import {
  InvalidEntrypointNameError,
  UnsupportedCrossRuntimeIntentError,
} from '../../src/tezosx/errors';
import type { EvmToMichelsonIntent } from '../../src/tezosx/types';

const TZ1 = 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb';
const KT1 = 'KT1PWx2mnDueood7fEmfbBDKx1D9BAnnXitn';

const decode = (data: `0x${string}`) => decodeFunctionData({ abi: NAC_PRECOMPILE_ABI, data });

describe('buildEvmToMichelsonCall', () => {
  it('wraps a transfer into a NAC `call` to http://tezos/<destination>', () => {
    const call = buildEvmToMichelsonCall({ kind: 'transfer', destination: TZ1, amount: 5n });
    expect(call.direction).toBe('evm-to-michelson');
    expect(call.to).toBe(NAC_PRECOMPILE_ADDRESS);
    expect(call.value).toBe(5n * WEI_PER_MUTEZ);
    expect(call.gasLimit).toBe(NAC_RECOMMENDED_GAS.call);
    expect(decode(call.data)).toEqual({
      functionName: 'call',
      args: [`http://tezos/${TZ1}`, [], '0x', 1],
    });
  });

  it('wraps a contract call into a NAC `callMichelson` with binary Micheline', () => {
    const call = buildEvmToMichelsonCall({
      kind: 'call-michelson',
      destination: KT1,
      entrypoint: 'default',
      parameter: '0x0A0000000401020304',
      amount: 3,
    });
    expect(call.to).toBe(NAC_PRECOMPILE_ADDRESS);
    expect(call.value).toBe(3n * WEI_PER_MUTEZ);
    expect(call.gasLimit).toBe(NAC_RECOMMENDED_GAS.callMichelson);
    expect(decode(call.data)).toEqual({
      functionName: 'callMichelson',
      args: [KT1, 'default', '0x0a0000000401020304'],
    });
  });

  it('defaults the amount of a contract call to 0', () => {
    const call = buildEvmToMichelsonCall({
      kind: 'call-michelson',
      destination: KT1,
      entrypoint: 'default',
      parameter: '00',
    });
    expect(call.value).toBe(0n);
  });

  it('packs a Michelson expression parameter without the 05 prefix', () => {
    const call = buildEvmToMichelsonCall({
      kind: 'call-michelson',
      destination: KT1,
      entrypoint: 'set',
      parameter: { value: { prim: 'Pair', args: [{ int: '1' }, { string: 'a' }] } },
    });
    // Pair (int 1) (string "a"): 07 07 | 00 01 | 01 00000001 61
    expect(decode(call.data).args).toEqual([KT1, 'set', '0x07070001010000000161']);
  });

  it('packs a typed Michelson expression parameter in its optimized form', () => {
    const call = buildEvmToMichelsonCall({
      kind: 'call-michelson',
      destination: KT1,
      entrypoint: 'default',
      parameter: { value: { string: TZ1 }, type: { prim: 'address' } },
    });
    const [, , data] = decode(call.data).args as [string, string, string];
    // address packed as bytes: 0a | 00000016 | 22-byte address
    expect(data.startsWith('0x0a00000016')).toBe(true);
  });

  it('rejects a binary Micheline parameter that is not a non-empty hex string', () => {
    for (const parameter of ['0a00zz', '0a0', '', '0x']) {
      expect(() =>
        buildEvmToMichelsonCall({
          kind: 'call-michelson',
          destination: KT1,
          entrypoint: 'default',
          parameter,
        })
      ).toThrow(InvalidHexStringError);
    }
  });

  it('only calls KT1 contracts with a valid entrypoint name', () => {
    const call = (destination: string, entrypoint: string) => () =>
      buildEvmToMichelsonCall({ kind: 'call-michelson', destination, entrypoint, parameter: '00' });
    expect(call(TZ1, 'default')).toThrow(InvalidContractAddressError);
    expect(call(KT1, 'set_value.v2')).not.toThrow();
    for (const entrypoint of ['', '%default', 'has space', 'a'.repeat(32)]) {
      expect(call(KT1, entrypoint)).toThrow(InvalidEntrypointNameError);
    }
  });

  it('accepts implicit accounts, contracts and any amount type for a transfer', () => {
    for (const destination of [TZ1, 'tz4EECtMxAuJ9UDLaiMZH7G1GCFYUWsj8HZn', KT1]) {
      for (const amount of [5n, 5, '5', '0x5']) {
        const call = buildEvmToMichelsonCall({ kind: 'transfer', destination, amount });
        expect(call.value).toBe(5n * WEI_PER_MUTEZ);
      }
    }
  });

  it('rejects invalid transfer destinations', () => {
    for (const destination of [
      'tz1abc',
      '0xdEAD000000000000000042000000000000000000',
      `${KT1}%foo`,
      'sr166cywS6HJx9gmqMU28Vo284gPQaPcGmYW',
    ]) {
      expect(() => buildEvmToMichelsonCall({ kind: 'transfer', destination, amount: 1n })).toThrow(
        InvalidAddressError
      );
    }
  });

  it('rejects amounts that are not non-negative integers', () => {
    for (const amount of [-1n, -1, 1.5, '1.5', '']) {
      expect(() => buildEvmToMichelsonCall({ kind: 'transfer', destination: TZ1, amount })).toThrow(
        InvalidAmountError
      );
    }
  });

  it('accepts at most 2^63 - 1 mutez, the Michelson mutez bound', () => {
    const max = 2n ** 63n - 1n;
    expect(buildEvmToMichelsonCall({ kind: 'transfer', destination: TZ1, amount: max }).value).toBe(
      max * WEI_PER_MUTEZ
    );
    for (const amount of [max + 1n, 2n ** 256n]) {
      expect(() => buildEvmToMichelsonCall({ kind: 'transfer', destination: TZ1, amount })).toThrow(
        InvalidAmountError
      );
    }
  });

  it('rejects unsupported intent kinds', () => {
    const intent = { kind: 'call-evm' } as unknown as EvmToMichelsonIntent;
    expect(() => buildEvmToMichelsonCall(intent)).toThrow(UnsupportedCrossRuntimeIntentError);
  });
});
