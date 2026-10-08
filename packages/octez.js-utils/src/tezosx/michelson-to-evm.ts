import { InvalidContractAddressError, ValidationResult } from '@tezos-x/octez.js-core';
import { isAddress } from 'viem';
import { validateContractAddress } from '../validators';
import { parseAmount, weiToMutezExact } from './amount';
import { NAC_ETHEREUM_RUNTIME_URL, NAC_GATEWAY } from './constants';
import { InvalidEvmAddressError } from './errors';
import { buildHttpCallParameter } from './gateway-parameters';
import type { BuildMichelsonToEvmCallOptions, EvmTransactionRequest, GatewayCall } from './types';

/**
 * Wrap an EVM transaction into a call to the NAC gateway contract, so that it can be
 * signed and sent on the Michelson runtime.
 *
 * A native transfer goes through the `%call` entrypoint, as a POST to
 * `http://ethereum/<to>` carrying the value.
 *
 * @example
 * ```
 * const call = buildMichelsonToEvmCall({ to: '0x…', value: 10n ** 15n });
 * ```
 */
export function buildMichelsonToEvmCall(
  tx: EvmTransactionRequest,
  options: BuildMichelsonToEvmCallOptions = {}
): GatewayCall {
  // Strict: a mixed-case address must carry a valid EIP-55 checksum
  if (!isAddress(tx.to)) {
    throw new InvalidEvmAddressError(tx.to);
  }
  const contractAddress = options.gatewayAddress ?? NAC_GATEWAY;
  const gatewayValidation = validateContractAddress(contractAddress);
  if (gatewayValidation !== ValidationResult.VALID) {
    throw new InvalidContractAddressError(contractAddress, gatewayValidation);
  }
  const mutezAmount = weiToMutezExact(parseAmount(tx.value ?? BigInt(0)));

  return {
    direction: 'michelson-to-evm',
    contractAddress,
    entrypoint: 'call',
    parameter: buildHttpCallParameter(`${NAC_ETHEREUM_RUNTIME_URL}${tx.to}`),
    mutezAmount,
  };
}
