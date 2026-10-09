import {
  InvalidContractAddressError,
  InvalidHexStringError,
  ValidationResult,
} from '@tezos-x/octez.js-core';
import { isAddress } from 'viem';
import { validateContractAddress } from '../validators';
import { parseAmount, weiToMutezExact } from './amount';
import { NAC_ETHEREUM_RUNTIME_URL, NAC_GATEWAY } from './constants';
import { InvalidEvmAddressError, MissingCalldataError, UnsafeMutezAmountError } from './errors';
import { buildCallEvmParameter, buildHttpCallParameter } from './gateway-parameters';
import { parseHexBytes } from './hex';
import { DEFAULT_KNOWN_SIGNATURES, resolveCalldataSignature } from './method-signature';
import type {
  BuildMichelsonToEvmCallOptions,
  EvmTransactionRequest,
  GatewayCall,
  GatewayTransferParams,
} from './types';

/**
 * Wrap an EVM transaction into a call to the NAC gateway contract, so that it can be
 * signed and sent on the Michelson runtime.
 *
 * A transaction without calldata becomes a native transfer through the `%call`
 * entrypoint; any other transaction becomes an EVM contract call through `%call_evm`.
 *
 * @example
 * ```
 * const call = buildMichelsonToEvmCall({ to: '0x…', value: 10n ** 15n });
 * await Tezos.contract.transfer(toTransferParams(call));
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
  // A non-empty calldata starts with a 4-byte function selector
  const calldata = parseHexBytes(tx.data ?? '');
  if (calldata.length > 0 && calldata.length < 8) {
    throw new InvalidHexStringError(tx.data ?? '', 'Expecting at least a 4-byte function selector');
  }

  if (calldata.length === 0) {
    if (tx.methodSignature !== undefined) {
      throw new MissingCalldataError(tx.methodSignature);
    }
    return {
      direction: 'michelson-to-evm',
      contractAddress,
      entrypoint: 'call',
      parameter: buildHttpCallParameter(`${NAC_ETHEREUM_RUNTIME_URL}${tx.to}`),
      mutezAmount,
    };
  }

  const selector = calldata.slice(0, 8);
  const methodSignature = resolveCalldataSignature(
    selector,
    tx.methodSignature,
    options.knownSignatures ?? DEFAULT_KNOWN_SIGNATURES
  );

  return {
    direction: 'michelson-to-evm',
    contractAddress,
    entrypoint: 'call_evm',
    parameter: buildCallEvmParameter(
      tx.to,
      methodSignature,
      calldata.slice(8),
      options.callback ?? { prim: 'None' }
    ),
    mutezAmount,
    methodSignature,
  };
}

/**
 * Turn a gateway call into transfer parameters for `Tezos.contract.transfer` or
 * `Tezos.wallet.transfer`.
 *
 * @throws {@link UnsafeMutezAmountError} if the amount does not fit in a JavaScript number
 */
export function toTransferParams(call: GatewayCall): GatewayTransferParams {
  if (call.mutezAmount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new UnsafeMutezAmountError(call.mutezAmount);
  }
  return {
    to: call.contractAddress,
    amount: Number(call.mutezAmount),
    mutez: true,
    parameter: {
      entrypoint: call.entrypoint,
      value: call.parameter,
    },
  };
}
