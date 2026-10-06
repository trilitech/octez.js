import {
  getEthereumTransactionHash,
  getTezosOperationHash,
  b58DecodeAndCheckPrefix,
  b58Encode,
  buf2hex,
  PrefixV2,
} from '../src/octez.js-utils';
import { InvalidHexStringError, ParameterValidationError } from '@tezos-x/octez.js-core';

// Golden vectors from the Tezos X kernel (`tezosx-journal`, tests
// `test_synthetic_operation_hash_golden` and `test_synthetic_evm_tx_hash_golden`),
// both computed on the parent bytes 0x01..0x20.
const parentHex = buf2hex(Uint8Array.from({ length: 32 }, (_, i) => i + 1));
const expectedOperationHashHex = '957934084c415ff8ccabf86a2af07db6cc557cf759e7aa50d1673bf48c39ccc5';
const expectedEvmTxHash = '0x5e0287136dd2a96e55aad495edcc329afc57df76e896e29c42e1f80d9da7deb4';

describe('getTezosOperationHash', () => {
  it('Should match the kernel golden vector', () => {
    const opHash = getTezosOperationHash(`0x${parentHex}`);
    expect(buf2hex(b58DecodeAndCheckPrefix(opHash, [PrefixV2.OperationHash], true))).toEqual(
      expectedOperationHashHex
    );
  });

  it('Should accept the hash with or without 0x, in any case', () => {
    const expected = getTezosOperationHash(`0x${parentHex}`);
    expect(getTezosOperationHash(parentHex)).toEqual(expected);
    expect(getTezosOperationHash(`0x${parentHex.toUpperCase()}`)).toEqual(expected);
  });

  it('Should reject a hash that is not 32 bytes', () => {
    expect(() => getTezosOperationHash(parentHex.slice(2))).toThrow(InvalidHexStringError);
    expect(() => getTezosOperationHash(`${parentHex}00`)).toThrow(InvalidHexStringError);
    expect(() => getTezosOperationHash('')).toThrow(InvalidHexStringError);
  });

  it('Should reject a non-hex string', () => {
    expect(() => getTezosOperationHash('zz'.repeat(32))).toThrow(InvalidHexStringError);
  });
});

describe('getEthereumTransactionHash', () => {
  const parentOpHash = b58Encode(parentHex, PrefixV2.OperationHash);

  it('Should match the kernel golden vector', () => {
    expect(getEthereumTransactionHash(parentOpHash)).toEqual(expectedEvmTxHash);
  });

  it('Should reject anything but an operation hash', () => {
    expect(() =>
      getEthereumTransactionHash('BLCTEDjZDtuUcYxmSPXHn3XrKruub4NF4mzTgR2EbpPRFN7JzDV')
    ).toThrow(ParameterValidationError);
    expect(() => getEthereumTransactionHash('tz1gvF4cD2dDtqitL3ZTraggSR1Mju2BKFEM')).toThrow(
      ParameterValidationError
    );
    expect(() => getEthereumTransactionHash(`0x${parentHex}`)).toThrow(ParameterValidationError);
  });
});
