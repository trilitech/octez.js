/**
 * JSON Micheline expression. Structurally identical to the `MichelsonV1Expression`
 * type of `@tezos-x/octez.js-rpc`, so values of either type can be used for the other.
 */
export type MichelineExpression =
  | { int?: string; string?: string; bytes?: string }
  | { prim: string; args?: MichelineExpression[]; annots?: string[] }
  | MichelineExpression[];
