import { InvalidAddressError, InvalidAmountError } from '@tezos-x/octez.js-core';
import { decodeFunctionData } from 'viem';
import { buildEvmToMichelsonCall } from '../../src/tezosx/evm-to-michelson';
import { NAC_PRECOMPILE_ABI } from '../../src/tezosx/abi';
import {
  NAC_PRECOMPILE_ADDRESS,
  NAC_RECOMMENDED_GAS,
  WEI_PER_MUTEZ,
} from '../../src/tezosx/constants';
import { UnsupportedCrossRuntimeIntentError } from '../../src/tezosx/errors';
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
