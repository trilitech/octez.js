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
