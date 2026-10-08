/**
 * @packageDocumentation
 * @module @tezos-x/octez.js-utils
 */

/*
 * Cross-runtime operation hashes on Tezos X.
 *
 * Tezos X runs a Michelson runtime and an EVM runtime side by side. An operation of one runtime
 * that calls into the other is mirrored there by a synthetic operation, whose hash the kernel
 * derives from the originating one. These functions compute that hash offline.
 */

import { blake2b } from '@noble/hashes/blake2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { InvalidHexStringError } from '@tezos-x/octez.js-core';
import { PrefixV2 } from './constants';
import { b58DecodeAndCheckPrefix, b58Encode, buf2hex, hex2buf, stripHexPrefix } from './encoding';

// Domain tags of the kernel's derivations (`tezosx-journal`). Each names the identifier being
// produced, not its source.
const SYNTHETIC_MICHELSON_OP_TAG = new TextEncoder().encode('michelson');
const SYNTHETIC_EVM_TX_TAG = new TextEncoder().encode('evm');

function tagged(tag: Uint8Array, parent: Uint8Array): Uint8Array {
  const preimage = new Uint8Array(tag.length + parent.length);
  preimage.set(tag);
  preimage.set(parent, tag.length);
  return preimage;
}

/**
 * Computes the hash of the synthetic Ethereum transaction mirroring a Michelson operation that
 * crossed into the EVM runtime of a Tezos X chain.
 *
 * Such a transaction has no signature to hash, so the kernel derives it from the originating
 * operation: `keccak256("evm" || michelson_op_hash)`, where `michelson_op_hash` is the raw 32-byte
 * operation hash. The result is the hash under which the EVM node serves the transaction
 * (e.g. `eth_getTransactionByHash`, `debug_traceTransaction`).
 *
 * @param michelsonOpHash Base58 operation hash (`o...`) of the Michelson operation
 * @returns `0x`-prefixed lowercase hex Ethereum transaction hash
 * @throws {@link ParameterValidationError} if `michelsonOpHash` is not a valid operation hash
 * @example getEthereumTransactionHash('oneDGhZacw99EEFaYDTtWfz5QEhUW3PPVFsHa7GShnLPuDn7gSd') // returns '0x9e3d2459fac9713cf0ad82b503e7d050167c942ee8ff4bf689a8986216066a50'
 */
export function getEthereumTransactionHash(michelsonOpHash: string): string {
  const parent = b58DecodeAndCheckPrefix(michelsonOpHash, [PrefixV2.OperationHash], true);
  return '0x' + buf2hex(keccak_256(tagged(SYNTHETIC_EVM_TX_TAG, parent)));
}

/**
 * Computes the hash of the synthetic Michelson operation mirroring an Ethereum transaction that
 * crossed into the Michelson runtime of a Tezos X chain (deposits included).
 *
 * Such an operation has no signature to hash, so the kernel derives it from the originating
 * transaction: `blake2b256("michelson" || evm_tx_hash)`. It is the hash under which the Tezos
 * RPC serves the operation, and the seed of the addresses of the contracts it originates.
 *
 * @param evmTxHash 32-byte Ethereum transaction hash, hex encoded, optionally `0x`-prefixed
 * @returns Base58 operation hash (`o...`)
 * @throws {@link InvalidHexStringError} if `evmTxHash` is not a 32-byte hex string
 * @example getTezosOperationHash('0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20') // returns 'oon3NRVSUVJUDwBSfeMcXYFVU1GgFghM4ciDQsP8kuvpGrmj4kG'
 */
export function getTezosOperationHash(evmTxHash: string): string {
  const parent = hex2buf(evmTxHash);
  if (parent.length !== 32) {
    throw new InvalidHexStringError(
      stripHexPrefix(evmTxHash),
      `Expecting a 32-byte Ethereum transaction hash`
    );
  }
  return b58Encode(
    blake2b(tagged(SYNTHETIC_MICHELSON_OP_TAG, parent), { dkLen: 32 }),
    PrefixV2.OperationHash
  );
}
