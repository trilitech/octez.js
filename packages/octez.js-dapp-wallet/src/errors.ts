import { PermissionScope } from '@tezos-x/octez.connect-dapp';
import {
  ParameterValidationError,
  PermissionDeniedError,
  TezosToolkitConfigError,
  OctezJsError,
} from '@tezos-x/octez.js-core';

/**
 *  @category Error
 *  Error that indicates the Beacon wallet not being initialized
 */
export class BeaconWalletNotInitialized extends PermissionDeniedError {
  constructor() {
    super();
    this.name = 'BeaconWalletNotInitialized';
    this.message =
      'BeaconWallet needs to be initialized by calling `await BeaconWallet.requestPermissions()` first. ' +
      'The network is configured on the BeaconWallet constructor, not on requestPermissions.';
  }
}

/**
 *  @category Error
 *  Error that indicates missing required permission scopes
 */
export class MissingRequiredScopes extends PermissionDeniedError {
  constructor(public readonly requiredScopes: PermissionScope[]) {
    super();
    this.name = 'MissingRequiredScopes';
    this.message = `Required permissions scopes: ${requiredScopes.join(',')} were not granted.`;
  }
}

/**
 *  @category Error
 *  Error that indicates a chain id that is not part of the current wallet session.
 *
 *  Named with a `Beacon` prefix to avoid colliding with `InvalidNetwork` from
 *  `@tezos-x/octez.js-wallet-connect`, which a dApp supporting both providers may
 *  also import.
 */
export class BeaconInvalidNetwork extends ParameterValidationError {
  constructor(public readonly chainId: string) {
    super(
      `Invalid network "${chainId}". It is not among the networks granted for this session - call getNetworks() to list them.`
    );
    this.name = 'BeaconInvalidNetwork';
  }
}

/**
 *  @category Error
 *  Error that indicates no RPC URL is known for a chain the caller asked to target
 *  while also handing over a TezosToolkit to re-point.
 */
export class BeaconNetworkRpcUrlUnknown extends TezosToolkitConfigError {
  constructor(public readonly chainId: string) {
    super();
    this.name = 'BeaconNetworkRpcUrlUnknown';
    this.message =
      `No RPC URL is known for network "${chainId}", so the TezosToolkit cannot be re-pointed at it. ` +
      'Declare it as `new BeaconWallet({ networks: [{ chainId, rpcUrl }] })`, or call setActiveNetwork without a toolkit.';
  }
}

/**
 *  @category Error
 *  Error that indicates the active network moved while a request was being prepared.
 */
export class BeaconNetworkChangedDuringRequest extends OctezJsError {
  constructor(
    public readonly expected: string,
    public readonly actual: string | undefined
  ) {
    super();
    this.name = 'BeaconNetworkChangedDuringRequest';
    this.message =
      `The active network changed from "${expected}" to "${actual ?? 'none'}" while the request was being prepared. ` +
      'The request was not sent, so it could not be signed against the wrong chain. Retry on the network you want.';
  }
}

/**
 *  @category Error
 *  Error that indicates a network switch did not take effect.
 */
export class BeaconNetworkSwitchFailed extends OctezJsError {
  constructor(public readonly chainId: string) {
    super();
    this.name = 'BeaconNetworkSwitchFailed';
    this.message =
      `Switching the active account to network "${chainId}" did not take effect. ` +
      'The wallet may have dropped the session; reconnect before retrying.';
  }
}
