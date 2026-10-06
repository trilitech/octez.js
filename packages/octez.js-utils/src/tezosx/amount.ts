import { InvalidAmountError } from '@tezos-x/octez.js-core';
import type { AmountLike } from './types';

const AMOUNT_STRING_RE = /^(\d+|0x[0-9a-fA-F]+)$/;

/**
 * Convert an amount to a non-negative bigint.
 *
 * @throws `InvalidAmountError` if `amount` is not a non-negative integer
 */
export function parseAmount(amount: AmountLike): bigint {
  let value: bigint;
  if (typeof amount === 'bigint') {
    value = amount;
  } else if (typeof amount === 'number' && Number.isSafeInteger(amount)) {
    value = BigInt(amount);
  } else if (typeof amount === 'string' && AMOUNT_STRING_RE.test(amount)) {
    value = BigInt(amount);
  } else {
    throw new InvalidAmountError(String(amount), 'Expecting a non-negative integer');
  }
  if (value < BigInt(0)) {
    throw new InvalidAmountError(String(amount), 'Expecting a non-negative integer');
  }
  return value;
}
