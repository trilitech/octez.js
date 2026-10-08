import { InvalidAddressError, ValidationResult } from '@tezos-x/octez.js-core';
import { validateContractAddress, validateKeyHash } from '../validators';
import { encodeNacCall } from './abi';
import { mutezToWei, parseAmount } from './amount';
import {
  NAC_HTTP_POST,
  NAC_PRECOMPILE_ADDRESS,
  NAC_RECOMMENDED_GAS,
  NAC_TEZOS_RUNTIME_URL,
} from './constants';
import { UnsupportedCrossRuntimeIntentError } from './errors';
import type { EvmToMichelsonIntent, PrecompileCall } from './types';

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
    default:
      throw new UnsupportedCrossRuntimeIntentError((intent as { kind: string }).kind);
  }
}
