import { parseAbiItem, toFunctionSignature, type AbiItem } from 'viem';
import { InvalidMethodSignatureError } from './errors';

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
