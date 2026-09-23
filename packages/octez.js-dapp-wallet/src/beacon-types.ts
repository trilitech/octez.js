// Side-effect-free re-exports from @tezos-x/octez.connect-types.
// Importing this module does NOT pull in the Beacon DAppClient or trigger
// any beacon-dapp initialization. Safe for type-only or enum-only usage.
//
// For BeaconEvent and DAppClientOptions, import from '@tezos-x/octez.js-dapp-wallet'
// (the main entry point) instead, since those live in @tezos-x/octez.connect-dapp
// which has unavoidable side effects.
export { NetworkType, PermissionScope, SigningType, Regions } from '@tezos-x/octez.connect-types';
export type {
  RequestPermissionInput,
  RequestSignPayloadInput,
  NodeDistributions,
  // The shape a dApp declares its chains with. `export type` only: a value re-export
  // would pull the whole beacon-dapp graph into this side-effect-free entry point.
  RequestPermissionNetwork as BeaconWalletNetwork,
} from '@tezos-x/octez.connect-types';
