/**
 * Address of the NAC (Native Account Contract) precompile on the Tezos X EVM runtime.
 * EVM → Michelson calls are sent to this address.
 */
export const NAC_PRECOMPILE_ADDRESS = '0xff00000000000000000000000000000000000007' as const;

/**
 * Address of the NAC gateway contract on the Tezos X Michelson runtime.
 * Michelson → EVM calls are sent to this contract. Pass `gatewayAddress` to
 * {@link buildMichelsonToEvmCall} to use another gateway.
 */
export const NAC_GATEWAY = 'KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw';

/**
 * HTTP method enum used by the generic NAC `call` entrypoint (`uint8` on the EVM
 * runtime, `nat` on the Michelson runtime).
 */
export const NAC_HTTP_POST = 1;

/**
 * Fixed wei ↔ mutez exchange between the two runtimes: 1 mutez (10⁻⁶ XTZ) is
 * 10¹² wei (XTZ has 18 decimals on the EVM runtime).
 */
export const WEI_PER_MUTEZ = BigInt(1_000_000_000_000);

/** URL prefix targeting an account of the Michelson runtime (EVM → Michelson). */
export const NAC_TEZOS_RUNTIME_URL = 'http://tezos/';

/** URL prefix targeting an account of the EVM runtime (Michelson → EVM). */
export const NAC_ETHEREUM_RUNTIME_URL = 'http://ethereum/';

/** Recommended EVM gas limits for calls to the NAC precompile. */
export const NAC_RECOMMENDED_GAS = {
  call: BigInt(3_000_000),
  callMichelson: BigInt(5_000_000),
} as const;
