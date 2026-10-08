import { parseAbiItem, toFunctionSignature, type AbiItem } from 'viem';
import { InvalidMethodSignatureError } from './errors';

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
 * Canonical form of an ABI function signature (e.g. `transfer(address,uint256)` for
 * `function transfer(address to, uint amount)`), as hashed into its selector.
 *
 * @throws {@link InvalidMethodSignatureError} if `methodSignature` is not an ABI
 * function signature
 */
export function toCanonicalSignature(methodSignature: string): string {
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
