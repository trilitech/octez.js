import {
  InvalidAddressError,
  InvalidAmountError,
  InvalidContractAddressError,
  ValidationResult,
} from '@tezos-x/octez.js-core';
import {
  packDataBytes,
  type MichelsonData,
  type MichelsonType,
} from '@tezos-x/octez.js-michel-codec';
import { validateContractAddress, validateKeyHash } from '../validators';
import { encodeNacCall, encodeNacCallMichelson } from './abi';
import { parseAmount } from './amount';
import { parseHexBytes } from './hex';
import {
  NAC_HTTP_POST,
  NAC_PRECOMPILE_ADDRESS,
  NAC_RECOMMENDED_GAS,
  NAC_TEZOS_RUNTIME_URL,
  WEI_PER_MUTEZ,
} from './constants';
import { InvalidEntrypointNameError, UnsupportedCrossRuntimeIntentError } from './errors';
import type { AmountLike, EvmToMichelsonIntent, PrecompileCall } from './types';

// Entrypoint names are made of Michelson annotation characters, are at most 31
// characters long and are given without their leading `%`
const ENTRYPOINT_RE = /^[a-zA-Z0-9_.@][a-zA-Z0-9_.%@]{0,30}$/;

/**
 * A transfer can credit an implicit account (tz…) or a contract (KT1).
 */
function validateTransferDestination(destination: string) {
  if (
    validateKeyHash(destination) !== ValidationResult.VALID &&
    validateContractAddress(destination) !== ValidationResult.VALID
  ) {
    throw new InvalidAddressError(destination, validateKeyHash(destination));
  }
}

function validateContractCall(destination: string, entrypoint: string) {
  const validation = validateContractAddress(destination);
  if (validation !== ValidationResult.VALID) {
    throw new InvalidContractAddressError(destination, validation);
  }
  if (!ENTRYPOINT_RE.test(entrypoint)) {
    throw new InvalidEntrypointNameError(entrypoint);
  }
}

// Michelson mutez amounts are signed 64-bit integers. This bound also keeps the wei
// value (at most ~9.2e30) far below the uint256 limit of EVM transaction values.
const MAX_MUTEZ = BigInt('9223372036854775807');

function mutezToWei(mutez: AmountLike): bigint {
  const amount = parseAmount(mutez);
  if (amount > MAX_MUTEZ) {
    throw new InvalidAmountError(amount.toString(), 'Expecting at most 2^63 - 1 mutez');
  }
  return amount * WEI_PER_MUTEZ;
}

/**
 * Binary Micheline of an entrypoint parameter, without the `05` pack prefix.
 */
function toBinaryMicheline(
  parameter: Extract<EvmToMichelsonIntent, { kind: 'call-michelson' }>['parameter']
): string {
  if (typeof parameter === 'string') {
    return parseHexBytes(parameter, 1);
  }
  const { bytes } = packDataBytes(
    parameter.value as MichelsonData,
    parameter.type as MichelsonType | undefined
  );
  return bytes.slice(2);
}

/**
 * Wrap a Michelson runtime operation into a call to the NAC precompile, so that it can
 * be signed and sent on the EVM runtime.
 *
 * The result is an unsigned EVM transaction (`to`, `data`, `value`, `gasLimit`) to
 * complete, sign and send with an EVM library.
 *
 * @example
 * ```
 * const call = buildEvmToMichelsonCall({ kind: 'transfer', destination: 'tz1…', amount: 1000n });
 * await walletClient.sendTransaction({ to: call.to, data: call.data, value: call.value, gas: call.gasLimit });
 * ```
 */
export function buildEvmToMichelsonCall(intent: EvmToMichelsonIntent): PrecompileCall {
  switch (intent.kind) {
    case 'transfer':
      validateTransferDestination(intent.destination);
      return {
        direction: 'evm-to-michelson',
        to: NAC_PRECOMPILE_ADDRESS,
        value: mutezToWei(intent.amount),
        data: encodeNacCall(
          `${NAC_TEZOS_RUNTIME_URL}${intent.destination}`,
          [],
          '0x',
          NAC_HTTP_POST
        ),
        gasLimit: NAC_RECOMMENDED_GAS.call,
      };
    case 'call-michelson':
      validateContractCall(intent.destination, intent.entrypoint);
      return {
        direction: 'evm-to-michelson',
        to: NAC_PRECOMPILE_ADDRESS,
        value: mutezToWei(intent.amount ?? BigInt(0)),
        data: encodeNacCallMichelson(
          intent.destination,
          intent.entrypoint,
          toBinaryMicheline(intent.parameter)
        ),
        gasLimit: NAC_RECOMMENDED_GAS.callMichelson,
      };
    default:
      throw new UnsupportedCrossRuntimeIntentError((intent as { kind: string }).kind);
  }
}
