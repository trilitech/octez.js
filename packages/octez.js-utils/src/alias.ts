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

const ethereumAddressRegex = /^0x[0-9a-fA-F]{40}$/;

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

/**
 * Computes the Michelson runtime alias of an EVM address: the originated (KT1) address
 * whose hash is the 20-byte Blake2b hash of the lowercase `0x`-prefixed hex address.
 *
 * @param address A `0x`-prefixed 20-byte hex Ethereum address, in any letter case
 * @returns The alias as a KT1 address, as returned by the EVM node's
 * `tez_getEthereumTezosAddress` RPC
 * @throws {@link InvalidAddressError} if `address` is not a `0x`-prefixed 20-byte hex string
 * @example getTezosAlias('0xccef676171871a48bbd6e2be75bbcc09d38830c5') // returns 'KT1TLraR9PboPAvxLKYQs9eU4n75rGFJTbWk'
 */
export function getTezosAlias(address: string): string {
  if (!ethereumAddressRegex.test(address)) {
    throw new InvalidAddressError(address, 'expecting a 0x-prefixed 20-byte hex Ethereum address');
  }
  return b58Encode(blake2b(utf8(address.toLowerCase()), { dkLen: 20 }), PrefixV2.ContractHash);
}
