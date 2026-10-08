import {
  InvalidAmountError,
  InvalidContractAddressError,
  InvalidHexStringError,
  ValidationResult,
} from '@tezos-x/octez.js-core';
import { validateContractAddress } from '../validators';
import {
  isAddress,
  parseAbiItem,
  toFunctionSelector,
  toFunctionSignature,
  type AbiItem,
} from 'viem';
import { NAC_ETHEREUM_RUNTIME_URL, NAC_HTTP_POST, NAC_GATEWAY, WEI_PER_MUTEZ } from './constants';
import {
  InvalidEvmAddressError,
  InvalidMethodSignatureError,
  MissingCalldataError,
  SelectorMismatchError,
  SubMutezPrecisionError,
  UnknownSelectorError,
  UnsafeMutezAmountError,
} from './errors';
import { stripHexPrefix } from '../encoding';
import { parseAmount } from './amount';
import { parseHexBytes } from './hex';
import type {
  BuildMichelsonToEvmCallOptions,
  MichelineExpression,
  EvmTransactionRequest,
  GatewayCall,
  GatewayTransferParams,
} from './types';

/**
 * ABI signatures of common EVM methods, indexed by selector. Used to resolve the
 * method of a `call_evm` when no `methodSignature` is given.
 */
export const DEFAULT_KNOWN_SIGNATURES: Readonly<Record<string, string>> = {
  a1544fc3: 'callMichelson(string,string,bytes)',
  a9059cbb: 'transfer(address,uint256)',
  '095ea7b3': 'approve(address,uint256)',
  '23b872dd': 'transferFrom(address,address,uint256)',
  '70a08231': 'balanceOf(address)',
  dd62ed3e: 'allowance(address,address)',
  '18160ddd': 'totalSupply()',
  '313ce567': 'decimals()',
  b6b55f25: 'deposit(uint256)',
  '2e1a7d4d': 'withdraw(uint256)',
  d0e30db0: 'deposit()',
  '3ccfd60b': 'withdraw()',
  '4e71d92d': 'claim()',
  '2e17de78': 'unstake(uint256)',
  d09de08a: 'increment()',
  '2baeceb7': 'decrement()',
  '3fb5c1cb': 'setNumber(uint256)',
};

/**
 * Convert wei to mutez, rejecting any sub-mutez remainder instead of flooring it away.
 *
 * @throws `InvalidAmountError` if `wei` is negative
 * @throws {@link SubMutezPrecisionError} if `wei` is not a whole number of mutez
 */
export function weiToMutezExact(wei: bigint): bigint {
  if (wei < BigInt(0)) {
    throw new InvalidAmountError(wei.toString());
  }
  const remainder = wei % WEI_PER_MUTEZ;
  if (remainder !== BigInt(0)) {
    throw new SubMutezPrecisionError(wei, remainder);
  }
  return wei / WEI_PER_MUTEZ;
}

/**
 * Parameter of the gateway `%call` entrypoint, an HTTP-style request:
 * `pair url (pair headers (pair body (pair method callback)))`.
 */
function buildHttpCallParameter(url: string): MichelineExpression {
  return {
    prim: 'Pair',
    args: [
      { string: url },
      {
        prim: 'Pair',
        args: [
          [],
          {
            prim: 'Pair',
            args: [
              { bytes: '' },
              {
                prim: 'Pair',
                args: [{ int: String(NAC_HTTP_POST) }, { prim: 'None' }],
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Parameter of the gateway `%call_evm` entrypoint:
 * `pair destination (pair method_signature (pair abi_parameters callback))`.
 */
function buildCallEvmParameter(
  destination: string,
  methodSignature: string,
  abiParameters: string,
  callback: MichelineExpression
): MichelineExpression {
  return {
    prim: 'Pair',
    args: [
      { string: destination },
      {
        prim: 'Pair',
        args: [
          { string: methodSignature },
          {
            prim: 'Pair',
            args: [{ bytes: abiParameters }, callback],
          },
        ],
      },
    ],
  };
}

/**
 * Canonical form of an ABI function signature (e.g. `transfer(address,uint256)` for
 * `function transfer(address to, uint amount)`), as hashed into its selector.
 */
function toCanonicalSignature(methodSignature: string): string {
  const trimmed = methodSignature.trim();
  let item: AbiItem;
  try {
    item = parseAbiItem(trimmed.startsWith('function ') ? trimmed : `function ${trimmed}`);
  } catch {
    throw new InvalidMethodSignatureError(methodSignature);
  }
  if (item.type !== 'function') {
    throw new InvalidMethodSignatureError(methodSignature);
  }
  return toFunctionSignature(item);
}

function lookUpSignature(
  selector: string,
  knownSignatures: Readonly<Record<string, string>>
): string | undefined {
  const entry = Object.entries(knownSignatures).find(
    ([key]) => stripHexPrefix(key).toLowerCase() === selector
  );
  return entry?.[1];
}

/**
 * Canonical signature of the called method, checked against the calldata selector:
 * the gateway hashes this signature into the selector of the EVM call.
 */
function resolveMethodSignature(
  selector: string,
  methodSignature: string | undefined,
  knownSignatures: Readonly<Record<string, string>>
): string {
  const signature = methodSignature ?? lookUpSignature(selector, knownSignatures);
  if (signature === undefined) {
    throw new UnknownSelectorError(selector);
  }
  const canonical = toCanonicalSignature(signature);
  if (stripHexPrefix(toFunctionSelector(canonical)) !== selector) {
    throw new SelectorMismatchError(signature, selector);
  }
  return canonical;
}

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
  const methodSignature = resolveMethodSignature(
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
