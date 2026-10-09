/**
 * JSON Micheline expression. Structurally identical to the `MichelsonV1Expression`
 * type of `@tezos-x/octez.js-rpc`, so values of either type can be used for the other.
 */
export type MichelineExpression =
  | { int?: string; string?: string; bytes?: string }
  | { prim: string; args?: MichelineExpression[]; annots?: string[] }
  | MichelineExpression[];

/**
 * Amount given as a bigint, a safe integer number or a decimal / 0x-prefixed hex string.
 */
export type AmountLike = bigint | number | string;

declare const amountBrand: unique symbol;

/**
 * Non-negative integer amount. Only {@link parseAmount} produces one, so functions
 * taking an `Amount` do not have to check its sign again. It is a plain bigint at
 * runtime.
 */
export type Amount = bigint & { readonly [amountBrand]: true };
