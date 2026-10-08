import {
  InvalidAddressError,
  InvalidContractAddressError,
  ValidationResult,
} from '@tezos-x/octez.js-core';
import { validateContractAddress, validateKeyHash } from '../validators';
import { encodeNacCall, encodeNacCallMichelson } from './abi';
import { mutezToWei, parseAmount } from './amount';
import {
  NAC_HTTP_POST,
  NAC_PRECOMPILE_ADDRESS,
  NAC_RECOMMENDED_GAS,
  NAC_TEZOS_RUNTIME_URL,
} from './constants';
import { InvalidEntrypointNameError, UnsupportedCrossRuntimeIntentError } from './errors';
import { parseHexBytes } from './hex';
import type { EvmToMichelsonIntent, PrecompileCall } from './types';

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
        value: mutezToWei(parseAmount(intent.amount)),
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
        value: mutezToWei(parseAmount(intent.amount ?? BigInt(0))),
        data: encodeNacCallMichelson(
          intent.destination,
          intent.entrypoint,
          parseHexBytes(intent.parameter, 1)
        ),
        gasLimit: NAC_RECOMMENDED_GAS.callMichelson,
      };
    default:
      throw new UnsupportedCrossRuntimeIntentError((intent as { kind: string }).kind);
  }
}
