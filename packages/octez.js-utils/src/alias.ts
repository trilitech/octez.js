/**
 * @packageDocumentation
 * @module @tezos-x/octez.js-utils
 */

/*
 * Cross-runtime address aliases on Tezos X.
 *
 * Tezos X runs a Michelson runtime and an EVM runtime side by side. Every address of one
 * runtime has a deterministic alias in the other. These functions compute the alias offline; they mirror the EVM node's
 * `tez_getTezosEthereumAddress` and `tez_getEthereumTezosAddress` RPCs.
 */

import { keccak_256 } from '@noble/hashes/sha3.js';
import { blake2b } from '@noble/hashes/blake2.js';
import { PrefixV2 } from './constants';
import { b58DecodeAndCheckPrefix, b58Encode, buf2hex, publicKeyHashPrefixes } from './encoding';
import { InvalidAddressError, ParameterValidationError } from '@tezos-x/octez.js-core';

const tezosAliasablePrefixes = [...publicKeyHashPrefixes, PrefixV2.ContractHash];

const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);

/**
 * Computes the EVM runtime alias of a Tezos address: the first 20 bytes of the Keccak-256
 * hash of the address's base58 encoding.
 *
 * @param address An implicit (tz1–tz5) or originated (KT1) Tezos address, without entrypoint
 * @returns The alias as a lowercase `0x`-prefixed hex string, as returned by the EVM node's
 * `tez_getTezosEthereumAddress` RPC
 * @throws {@link InvalidAddressError} if `address` is not a valid implicit or originated address
 * @example getEthereumAlias('tz1KqTpEZ7Yob7QbPE4Hy4Wo8fHG8LhKxZSx') // returns '0xccef676171871a48bbd6e2be75bbcc09d38830c5'
 */
export function getEthereumAlias(address: string): string {
  try {
    b58DecodeAndCheckPrefix(address, tezosAliasablePrefixes);
  } catch (err: unknown) {
    if (err instanceof ParameterValidationError && err.result !== undefined) {
      throw new InvalidAddressError(address, err.result);
    }
    throw err;
  }
  return '0x' + buf2hex(keccak_256(utf8(address)).subarray(0, 20));
}
