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

/**
 * A Michelson → EVM call: a contract call to the NAC gateway on the Michelson runtime.
 */
export interface GatewayCall {
  direction: 'michelson-to-evm';
  /** Address of the NAC gateway contract */
  contractAddress: string;
  /** `call` for a bare native transfer, `call_evm` for an EVM contract call */
  entrypoint: 'call' | 'call_evm';
  /** Parameter of the gateway entrypoint */
  parameter: MichelineExpression;
  /** Amount sent along with the call, in mutez */
  mutezAmount: bigint;
  /**
   * Canonical ABI signature of the called EVM method (e.g. `transfer(address,uint256)`).
   * Only set for `call_evm`.
   */
  methodSignature?: string;
}

/**
 * An EVM transaction to wrap into a Michelson → EVM call.
 */
export interface EvmTransactionRequest {
  /** Destination EVM address (0x-prefixed, 20 bytes, EIP-55 checksummed if mixed-case) */
  to: string;
  /** Value in wei. Defaults to 0 */
  value?: AmountLike;
  /**
   * Calldata (hex). Empty or missing for a bare native transfer, otherwise at least
   * the 4-byte function selector
   */
  data?: string;
  /**
   * ABI signature of the called method (e.g. `transfer(address,uint256)` or
   * `function transfer(address to, uint256 amount)`). It is sent to the gateway in its
   * canonical form, which must match the selector of `data`, so it requires `data`.
   * When missing, the selector is looked up in the known signatures.
   */
  methodSignature?: string;
}

export interface BuildMichelsonToEvmCallOptions {
  /** Address of the NAC gateway contract. Defaults to {@link NAC_GATEWAY} */
  gatewayAddress?: string;
  /** Callback of the `call_evm` entrypoint. Defaults to `None` */
  callback?: MichelineExpression;
  /**
   * Selector (8 hex chars, with or without 0x, any case) → ABI signature map used
   * when `methodSignature` is not given. Defaults to {@link DEFAULT_KNOWN_SIGNATURES}
   */
  knownSignatures?: Record<string, string>;
}
