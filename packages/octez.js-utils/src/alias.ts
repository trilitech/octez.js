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
import { b58DecodeAndCheckPrefix, b58Encode, buf2hex, hex2buf, publicKeyHashPrefixes } from './encoding';
import { InvalidAddressError, ParameterValidationError } from '@tezos-x/octez.js-core';

const tezosAliasablePrefixes = [...publicKeyHashPrefixes, PrefixV2.ContractHash];

const ethereumAddressRegex = /^0x[0-9a-fA-F]{40}$/;

const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((len, part) => len + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

/*
 * Constants of the recoverable alias scheme (RFC-26051, rescue accounts v1). The alias of a
 * tz1/tz2/tz3 account is the CREATE2 address, through the Safe singleton factory, of a minimal
 * proxy to the account type's rescue implementation, with the owner's public key hash appended.
 * Any change to these values changes every alias.
 */

/** Safe singleton factory, at the same address on every EVM chain */
const RESCUE_FACTORY = hex2buf('914d7fec6aac8cd542e72bca78b30650d45643d7');

/** `keccak256("tezosx.rescue.v1")` */
const RESCUE_SALT = hex2buf('9b8bb449a3d23b110d8c46424ba9b40748ac28bc7b99b7422a272950e17bb1d8');

/** Clone prefix: refuses to deploy when the guard address (written on Tezos X) has code */
const RESCUE_CLONE_PREFIX = hex2buf(
  '733822d2fe3dce6ce4f4c7f274e2415fa3fae66c3e3b15601e57600080fd5b604180602a6000396000f3'
);

/** EIP-1167 minimal proxy, around the 20-byte implementation address */
const RESCUE_CLONE_RUNTIME_HEAD = hex2buf('363d3d373d3d3d363d73');
const RESCUE_CLONE_RUNTIME_TAIL = hex2buf('5af43d82803e903d91602b57fd5bf3');

/** Rescue implementation per account type, deployed at the same address on every chain */
const rescueImplementations: { [prefix: string]: Uint8Array } = {
  [PrefixV2.Ed25519PublicKeyHash]: hex2buf('d532c0971e9c85e2468c8cc6c3949eae285cd513'),
  [PrefixV2.Secp256k1PublicKeyHash]: hex2buf('b47274809a09e0e0d565f1b50feba2a1cddc8199'),
  [PrefixV2.P256PublicKeyHash]: hex2buf('924f65272e0b3531084b1539b96ed0522541f7d7'),
};

const rescueAlias = (implementation: Uint8Array, pkh: Uint8Array): Uint8Array => {
  const initcode = concat(
    RESCUE_CLONE_PREFIX,
    RESCUE_CLONE_RUNTIME_HEAD,
    implementation,
    RESCUE_CLONE_RUNTIME_TAIL,
    pkh
  );
  const preimage = concat(
    new Uint8Array([0xff]),
    RESCUE_FACTORY,
    RESCUE_SALT,
    keccak_256(initcode)
  );
  return keccak_256(preimage).subarray(12);
};

/**
 * Computes the EVM runtime alias of a Tezos address.
 *
 * - For a tz1, tz2 or tz3 address, the alias is recoverable (RFC-26051): it is the `CREATE2`
 * address, through the Safe singleton factory, of a rescue account bound to the address's public
 * key hash. Funds sent to it by mistake on another EVM chain can be recovered with the Tezos key.
 * - For any other address (tz4, tz5, KT1), the alias is the first 20 bytes of the Keccak-256 hash
 * of the address's base58 encoding.
 *
 * @param address An implicit (tz1–tz5) or originated (KT1) Tezos address, without entrypoint
 * @returns The alias as a lowercase `0x`-prefixed hex string, as returned by the EVM node's
 * `tez_getTezosEthereumAddress` RPC
 * @throws {@link InvalidAddressError} if `address` is not a valid implicit or originated address
 * @example getEthereumAlias('tz1aAdmy1MiGhnRkw8RWS6xbUpTuSRh3ZB4y') // returns '0xf20dc8cfe3ab395547d9d702e2d1efb6378e38a6'
 */
export function getEthereumAlias(address: string): string {
  let decoded: [Uint8Array, PrefixV2];
  try {
    decoded = b58DecodeAndCheckPrefix(address, tezosAliasablePrefixes);
  } catch (err: unknown) {
    if (err instanceof ParameterValidationError && err.result !== undefined) {
      throw new InvalidAddressError(address, err.result);
    }
    throw err;
  }
  const [pkh, prefix] = decoded;
  const implementation = rescueImplementations[prefix];
  if (implementation !== undefined) {
    return '0x' + buf2hex(rescueAlias(implementation, pkh));
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
