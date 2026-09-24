/**
 * @packageDocumentation
 * @module @tezos-x/octez.js-dapp-wallet
 */

import {
  AccountInfo,
  BeaconEvent,
  DAppClient,
  DAppClientOptions,
  RequestPermissionInput,
  PermissionScope,
  getDAppClientInstance,
  isValidTezosCaip2,
  normalizeTezosCaip2,
  RequestPermissionNetwork,
  SigningType,
  NodeDistributions,
  Regions,
  tezosCaip2FromNetworkType,
} from '@tezos-x/octez.connect-dapp';
import {
  BeaconActiveAccountHasNoChainId,
  BeaconInvalidNetwork,
  BeaconNetworkChangedDuringRequest,
  BeaconNetworkRpcUrlUnknown,
  BeaconNetworkSwitchFailed,
  BeaconWalletNotInitialized,
  MissingRequiredScopes,
} from './errors';
import toBuffer from 'typedarray-to-buffer';
import {
  createIncreasePaidStorageOperation,
  createOriginationOperation,
  createSetDelegateOperation,
  createTransferOperation,
  createRegisterGlobalConstantOperation,
  WalletDelegateParams,
  WalletIncreasePaidStorageParams,
  WalletOriginateParams,
  TezosToolkit,
  TzReadProvider,
  WalletProvider,
  WalletTransferParams,
  WalletStakeParams,
  WalletUnstakeParams,
  WalletFinalizeUnstakeParams,
  WalletTransferTicketParams,
  WalletRegisterGlobalConstantParams,
  createTransferTicketOperation,
  ParamsWithOptionalFees,
} from '@tezos-x/octez.js';
import { buf2hex, hex2buf, mergebuf } from '@tezos-x/octez.js-utils';
import { UnsupportedActionError } from '@tezos-x/octez.js-core';

export { VERSION } from './version';
export {
  BeaconActiveAccountHasNoChainId,
  BeaconInvalidNetwork,
  BeaconNetworkChangedDuringRequest,
  BeaconNetworkRpcUrlUnknown,
  BeaconNetworkSwitchFailed,
  BeaconWalletNotInitialized,
  MissingRequiredScopes,
} from './errors';

// Re-exported from @tezos-x/octez.connect-dapp for consumers who need these without
// a direct beacon-dapp dependency. These types live only in beacon-dapp (not in
// beacon-types), so they come with beacon-dapp's side effects. For side-effect-free
// beacon types (NetworkType, SigningType, etc.), use '@tezos-x/octez.js-dapp-wallet/types'.
export { BeaconEvent };
export type { DAppClientOptions } from '@tezos-x/octez.connect-dapp';

/**
 * Default matrix relay nodes curated by octez.js.
 *
 * Includes only Trilitech-operated `octez.io` nodes. These replace the Beacon
 * SDK built-in defaults so that octez.js controls which relay infrastructure
 * its users hit.
 *
 * Non-European regions are intentionally empty because octez.js no longer
 * curates Papers-operated relay nodes for those regions.
 *
 * Users can still override specific regions (or the entire list) by passing
 * their own `matrixNodes` in the BeaconWallet constructor options.
 */
const TAQUITO_CURATED_MATRIX_NODES: NodeDistributions = {
  [Regions.EUROPE_WEST]: [
    'beacon-node-1.octez.io',
    'beacon-node-2.octez.io',
    'beacon-node-3.octez.io',
    'beacon-node-4.octez.io',
    'beacon-node-5.octez.io',
    'beacon-node-6.octez.io',
    'beacon-node-7.octez.io',
    'beacon-node-8.octez.io',
  ],
  // Left empty so octez.js does not point users at soon-to-be-retired Papers relays
  [Regions.NORTH_AMERICA_EAST]: [],
  [Regions.NORTH_AMERICA_WEST]: [],
  [Regions.ASIA_EAST]: [],
  [Regions.AUSTRALIA]: [],
};

/**
 * A Tezos chain the dApp wants to work with, declared on the BeaconWallet constructor.
 *
 * `rpcUrl` is the endpoint *this dApp* trusts for that chain. It is what
 * {@link BeaconWallet.setActiveNetwork} re-points a TezosToolkit at, and it is sent to
 * the wallet as a hint. Declaring it here rather than at permission-request time means
 * it is re-declared on every page load by construction, so it survives a reload without
 * anything being persisted.
 */
export type BeaconWalletNetwork = RequestPermissionNetwork;

/**
 * One network granted for the current session, as reported by
 * {@link BeaconWallet.getNetworks}.
 */
export interface BeaconNetworkInfo {
  /**
   * CAIP-2 chain id. Absent on a legacy single-network session whose NetworkType has no
   * known genesis id, in which case the entry cannot be passed to
   * {@link BeaconWallet.setActiveNetwork}.
   */
  chainId?: string;
  name: string;
  /**
   * The endpoint this dApp declared for the chain, and the only one
   * {@link BeaconWallet.setActiveNetwork} will point a toolkit at.
   */
  rpcUrl?: string;
  /**
   * What the wallet suggested. Never adopted automatically - a peer that chooses the node
   * the dApp reads from could serve it fabricated state - but readable so a dApp can pass
   * it back deliberately.
   */
  walletRpcUrl?: string;
}

/**
 * Options for {@link BeaconWallet.setActiveNetwork}.
 */
export interface SetActiveNetworkOptions {
  /**
   * The toolkit to move onto the target chain. Without it only the wallet's active
   * account moves and the toolkit keeps reading from the previous chain.
   */
  toolkit?: TezosToolkit;
  /**
   * Re-pass a custom read provider. Re-pointing the RPC rebuilds the read provider, and
   * TezosToolkit exposes no getter for the old one, so a custom provider is otherwise
   * replaced by the default RPC-backed adapter.
   */
  readProvider?: TzReadProvider;
}

/**
 * BeaconWallet constructor options: the Beacon DAppClient options, plus the chains this
 * dApp works with.
 */
export type BeaconWalletOptions = DAppClientOptions & {
  networks?: BeaconWalletNetwork[];
};

type RPCOperationWithLimits = {
  fee?: number | string;
  gas_limit?: number | string;
  storage_limit?: number | string;
};

export class BeaconWallet implements WalletProvider {
  /**
   * The underlying Beacon `DAppClient` instance.
   *
   * Exposed for advanced use cases such as subscribing to Beacon events.
   * Calling methods directly on the client (e.g., `client.clearActiveAccount()`)
   * bypasses octez.js's wallet lifecycle. For disconnecting, prefer
   * {@link BeaconWallet.disconnect} instead.
   */
  public client: DAppClient;

  /**
   * Chains declared on the constructor, keyed by normalized CAIP-2 id. Authoritative for
   * RPC URLs: narrowing a later permission request never removes what was declared here.
   */
  private readonly declaredNetworks: Map<string, BeaconWalletNetwork>;

  /** Declared chains the wallet did not grant on the last permission request. */
  private ungrantedNetworks: string[] = [];

  constructor(options: BeaconWalletOptions) {
    const { networks, ...clientOptions } = options;
    const matrixNodes: NodeDistributions = {
      ...TAQUITO_CURATED_MATRIX_NODES,
      ...(options.matrixNodes ?? {}),
    };

    this.declaredNetworks = new Map();
    for (const network of networks ?? []) {
      const chainId = normalizeTezosCaip2(network.chainId);
      if (!isValidTezosCaip2(chainId)) {
        throw new BeaconInvalidNetwork(network.chainId);
      }
      this.declaredNetworks.set(chainId, { ...network, chainId });
    }

    // `networks` is octez.js's own option and is not understood by the Beacon client.
    this.client = getDAppClientInstance({ ...clientOptions, matrixNodes });
    this.watchForWalletDrivenSwitches();
  }

  /**
   * A wallet can move the active account on its own (a ChangeAccountRequest), without any
   * call to {@link BeaconWallet.setActiveNetwork}. Nothing re-points the toolkit in that
   * case, so its RPC - and the PKH it has cached - can be left on the previous chain.
   *
   * There is no way to re-point a toolkit this class was never handed, so this reports the
   * situation rather than papering over it.
   */
  private watchForWalletDrivenSwitches() {
    if (typeof this.client.subscribeToEvent !== 'function') {
      return;
    }
    let lastChainId: string | undefined;
    void this.client
      .subscribeToEvent(BeaconEvent.ACTIVE_ACCOUNT_SET, (account?: AccountInfo) => {
        const chainId = account ? BeaconWallet.chainIdOf(account) : undefined;
        if (
          chainId !== lastChainId &&
          lastChainId !== undefined &&
          !this.switchInProgress
        ) {
          // eslint-disable-next-line no-console
          console.warn(
            `[BeaconWallet] The wallet moved the active account to "${chainId ?? 'an unknown network'}" ` +
              'without setActiveNetwork() being called. Any TezosToolkit you wired to this wallet is ' +
              'still pointed at the previous chain - call setActiveNetwork(chainId, { toolkit }) to realign it.'
          );
        }
        lastChainId = chainId;
      })
      .catch(() => {
        // Subscription is a diagnostic, never a hard dependency of the wallet.
      });
  }

  /** Set while this class is driving a switch, so its own moves are not reported as the wallet's. */
  private switchInProgress = false;

  /**
   * Accounts belonging to the current pairing.
   *
   * The Beacon account store is never pruned, so it can still hold accounts from
   * pairings that are long gone. Those are not switchable targets - their peer no longer
   * exists - so they are filtered out by sender.
   */
  private async getSessionAccounts(): Promise<AccountInfo[]> {
    const active = await this.client.getActiveAccount();
    if (!active) {
      return [];
    }
    const accounts = await this.client.getAccounts();
    return accounts.filter((account) => account.senderId === active.senderId);
  }

  /**
   * The chain id exactly as the Beacon client sees it - unnormalized, and absent on a
   * legacy account. Used only for the multi-network predicate, which has to agree with
   * the client's own (which reads the raw value too).
   */
  private static rawChainIdOf(account: AccountInfo): string | undefined {
    const chainId = account.network?.chainId;
    return typeof chainId === 'string' && chainId.length > 0 ? chainId : undefined;
  }

  /**
   * The chain id this account can be addressed by, normalized, falling back to the one
   * implied by its NetworkType on a legacy account that carries none.
   *
   * Every accessor that hands a chain id to a caller, and every lookup that accepts one
   * back, goes through this - otherwise `getNetworks()` would advertise ids that
   * `setActiveNetwork()` rejects.
   */
  private static chainIdOf(account: AccountInfo): string | undefined {
    const raw = BeaconWallet.rawChainIdOf(account);
    if (raw !== undefined) {
      return normalizeTezosCaip2(raw);
    }
    return account.network?.type ? tezosCaip2FromNetworkType(account.network.type) : undefined;
  }

  /**
   * One read of the session, shared by everything that needs it during a request.
   *
   * `getAccounts()` and `getActiveAccount()` are storage reads, so resolving the
   * predicate, the active account and the active chain id independently would cost three
   * or four round-trips per operation.
   */
  private async snapshotSession(): Promise<{
    active: AccountInfo | undefined;
    isMultiNetwork: boolean;
    activeChainId: string | undefined;
  }> {
    const [active, accounts] = await Promise.all([
      this.client.getActiveAccount(),
      this.client.getAccounts(),
    ]);
    const rawChainIds = new Set(
      accounts.map((a) => BeaconWallet.rawChainIdOf(a)).filter((c): c is string => c !== undefined)
    );
    return {
      active,
      isMultiNetwork: rawChainIds.size > 1,
      activeChainId: active ? BeaconWallet.chainIdOf(active) : undefined,
    };
  }

  /**
   * Whether the Beacon session spans more than one chain.
   *
   * Reads the whole account store on purpose: that is what the Beacon client itself
   * looks at when deciding whether an operation request must carry a network, so this
   * agrees with it even when the dApp has since narrowed its own declared list.
   */
  async isMultiNetwork(): Promise<boolean> {
    return (await this.snapshotSession()).isMultiNetwork;
  }

  /**
   * The networks granted for this session.
   *
   * A legacy single-network session carries no chain id at all, so one entry is
   * synthesized from the active account's network; its `chainId` is only present when the
   * network has a known genesis id.
   */
  async getNetworks(): Promise<BeaconNetworkInfo[]> {
    const accounts = await this.getSessionAccounts();
    if (accounts.length === 0) {
      return [];
    }

    const byChainId = new Map<string, AccountInfo>();
    for (const account of accounts) {
      const chainId = BeaconWallet.chainIdOf(account);
      if (chainId !== undefined && !byChainId.has(chainId)) {
        byChainId.set(chainId, account);
      }
    }

    if (byChainId.size === 0) {
      // Synthesize from the active account specifically: a legacy store can hold several
      // accounts for one sender, and the caller means the one in use.
      const active = await this.client.getActiveAccount();
      const account = active ?? accounts[0];
      const network = account.network;
      const chainId = network?.type ? tezosCaip2FromNetworkType(network.type) : undefined;
      const declared = chainId ? this.declaredNetworks.get(chainId) : undefined;
      return [
        {
          ...(chainId ? { chainId } : {}),
          name: declared?.name ?? network?.name ?? network?.type ?? 'tezos',
          rpcUrl: declared?.rpcUrl,
          walletRpcUrl: network?.rpcUrl,
        },
      ];
    }

    return Array.from(byChainId.entries()).map(([chainId, account]) => {
      const declared = this.declaredNetworks.get(chainId);
      return {
        chainId,
        name: declared?.name ?? account.network?.name ?? chainId,
        rpcUrl: declared?.rpcUrl,
        walletRpcUrl: account.network?.rpcUrl,
      };
    });
  }

  /**
   * The chain currently being targeted, as a CAIP-2 id.
   *
   * Which chain is active right after pairing is chosen by the wallet, not by the order
   * the dApp asked for them. Call {@link BeaconWallet.setActiveNetwork} once after
   * connecting to land on a specific one.
   */
  async getActiveNetwork(): Promise<string | undefined> {
    const active = await this.client.getActiveAccount();
    return active ? BeaconWallet.chainIdOf(active) : undefined;
  }

  /**
   * Declared chains the wallet did not grant on the last permission request.
   *
   * A wallet may grant fewer chains than were asked for, and does so without raising an
   * error. Chains with no known genesis id are also dropped before the request reaches a
   * WalletConnect wallet.
   */
  getUngrantedNetworks(): string[] {
    return [...this.ungrantedNetworks];
  }

  /**
   * Point the wallet - and optionally a toolkit - at another chain.
   *
   * Everything is validated before anything moves, so a rejected call leaves the wallet
   * and the toolkit exactly as they were. Passing `toolkit` moves the RPC with the
   * account; without it the toolkit keeps reading from the previous chain.
   *
   * @throws BeaconInvalidNetwork if the chain is not part of this session
   * @throws BeaconNetworkRpcUrlUnknown if a toolkit was passed but no RPC URL is known
   * @throws BeaconNetworkSwitchFailed if the wallet did not apply the switch
   */
  async setActiveNetwork(chainId: string, options: SetActiveNetworkOptions = {}) {
    if (typeof chainId !== 'string' || chainId.length === 0) {
      throw new BeaconInvalidNetwork(String(chainId));
    }
    const normalized = normalizeTezosCaip2(chainId);
    if (!isValidTezosCaip2(normalized)) {
      throw new BeaconInvalidNetwork(chainId);
    }

    const previous = await this.client.getActiveAccount();
    if (!previous) {
      throw new BeaconWalletNotInitialized();
    }

    const accounts = await this.getSessionAccounts();
    const target = accounts.find((account) => BeaconWallet.chainIdOf(account) === normalized);
    if (!target) {
      throw new BeaconInvalidNetwork(chainId);
    }

    // Only a dApp-declared endpoint is used to re-point the toolkit. A wallet-supplied one
    // is readable from getNetworks() as `walletRpcUrl`, so a dApp that wants it can pass it
    // back deliberately - but it is never adopted silently, because a peer that chooses the
    // node the dApp reads from can serve it fabricated balances and storage.
    const rpcUrl = this.declaredNetworks.get(normalized)?.rpcUrl;
    if (options.toolkit && !rpcUrl) {
      throw new BeaconNetworkRpcUrlUnknown(normalized);
    }

    const alreadyActive = target.accountIdentifier === previous.accountIdentifier;

    if (!alreadyActive) {
      this.switchInProgress = true;
      try {
        await this.client.setActiveAccount(target);
      } finally {
        this.switchInProgress = false;
      }

      // The Beacon client can decline to apply a switch (a session the wallet has already
      // dropped) without reporting it, which would leave the toolkit re-pointed at a chain
      // the wallet is not on.
      const applied = await this.client.getActiveAccount();
      if (applied === undefined || applied.accountIdentifier !== target.accountIdentifier) {
        throw new BeaconNetworkSwitchFailed(normalized);
      }
    }

    if (!options.toolkit) {
      return;
    }

    // Reached on the already-active path too: after a page reload the restored session and
    // a freshly constructed toolkit routinely disagree, and reconciling that is exactly
    // what a dApp calls this with its current network for.
    const toolkit = options.toolkit;
    let previousRpcUrl: string | undefined;
    try {
      previousRpcUrl = toolkit.rpc.getRpcUrl();
    } catch {
      previousRpcUrl = undefined;
    }
    if (previousRpcUrl === rpcUrl && alreadyActive) {
      // Nothing to move, and rebuilding the read provider would discard a custom one.
      return;
    }

    try {
      // setProvider, not setRpcProvider: the latter leaves the read provider bound to the
      // previous RPC client, so reads would stay on the old chain.
      toolkit.setProvider({
        rpc: rpcUrl,
        wallet: this,
        ...(options.readProvider ? { readProvider: options.readProvider } : {}),
      });
    } catch (err) {
      if (!alreadyActive) {
        // Best effort, and it must never mask the original failure: the rollback is itself
        // a switch and can fail the same way.
        try {
          await this.client.setActiveAccount(previous);
        } catch {
          // swallowed on purpose - `err` is what the caller needs to see
        }
      }
      throw err;
    }
  }

  private validateRequiredScopesOrFail(
    permissionScopes: PermissionScope[],
    requiredScopes: PermissionScope[]
  ) {
    const mandatoryScope = new Set(requiredScopes);

    for (const scope of permissionScopes) {
      if (mandatoryScope.has(scope)) {
        mandatoryScope.delete(scope);
      }
    }

    if (mandatoryScope.size > 0) {
      throw new MissingRequiredScopes(Array.from(mandatoryScope));
    }
  }

  /**
   * Ask the wallet for permissions.
   *
   * With no `networks` key in the argument, the chains declared on the constructor are
   * requested. Passing `networks` explicitly requests exactly that list instead, which is
   * how a dApp asks for a subset - the declared RPC URLs are kept either way.
   */
  async requestPermissions(request?: RequestPermissionInput) {
    const declared = Array.from(this.declaredNetworks.values());
    const input: RequestPermissionInput | undefined =
      request && 'networks' in request
        ? request
        : declared.length > 0
          ? { ...(request ?? {}), networks: declared }
          : request;

    await this.client.requestPermissions(input);

    const requested = (input?.networks ?? []).map((n) => normalizeTezosCaip2(n.chainId));
    this.ungrantedNetworks = [];
    if (requested.length > 0) {
      // Resolved ids, matching getNetworks(): computing this from the raw chain id would
      // report every declared chain as ungranted on a legacy session, contradicting
      // getNetworks() and firing a spurious warning.
      const granted = new Set(
        (await this.getSessionAccounts())
          .map((a) => BeaconWallet.chainIdOf(a))
          .filter((c): c is string => c !== undefined)
      );
      this.ungrantedNetworks = requested.filter((chainId) => !granted.has(chainId));

      // A wallet can grant fewer chains than were asked for without raising anything, and
      // chains with no known genesis id never reach a WalletConnect wallet at all. Left
      // unsaid, the dApp silently has fewer chains than it believes.
      if (this.ungrantedNetworks.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[BeaconWallet] The wallet did not grant ${this.ungrantedNetworks.length} of the ` +
            `${requested.length} requested network(s): ${this.ungrantedNetworks.join(', ')}. ` +
            'They are not switchable; see getUngrantedNetworks().'
        );
      }
    }
  }

  async getPKH() {
    const account = await this.client.getActiveAccount();
    if (!account) {
      throw new BeaconWalletNotInitialized();
    }
    return account.address;
  }

  async getPK() {
    const account = await this.client.getActiveAccount();
    if (!account) {
      throw new BeaconWalletNotInitialized();
    }
    return account.publicKey ?? '';
  }

  async mapTransferParamsToWalletParams(params: () => Promise<WalletTransferParams>) {
    let walletParams: WalletTransferParams;
    await this.client.showPrepare();
    try {
      walletParams = await params();
    } catch (err) {
      await this.client.hideUI(['alert']);
      throw err;
    }
    return this.removeDefaultParams(
      walletParams,
      await createTransferOperation(this.formatParameters(walletParams))
    );
  }

  async mapTransferTicketParamsToWalletParams(params: () => Promise<WalletTransferTicketParams>) {
    let walletParams: WalletTransferTicketParams;
    await this.client.showPrepare();
    try {
      walletParams = await params();
    } catch (err) {
      await this.client.hideUI(['alert']);
      throw err;
    }

    return this.removeDefaultParams(
      walletParams,
      await createTransferTicketOperation(this.formatParameters(walletParams))
    );
  }

  async mapStakeParamsToWalletParams(params: () => Promise<WalletStakeParams>) {
    let walletParams: WalletStakeParams;
    await this.client.showPrepare();
    try {
      walletParams = await params();
    } catch (err) {
      await this.client.hideUI(['alert']);
      throw err;
    }
    return this.removeDefaultParams(
      walletParams,
      await createTransferOperation(this.formatParameters(walletParams) as WalletTransferParams)
    );
  }

  async mapUnstakeParamsToWalletParams(params: () => Promise<WalletUnstakeParams>) {
    let walletParams: WalletUnstakeParams;
    await this.client.showPrepare();
    try {
      walletParams = await params();
    } catch (err) {
      await this.client.hideUI(['alert']);
      throw err;
    }
    return this.removeDefaultParams(
      walletParams,
      await createTransferOperation(this.formatParameters(walletParams) as WalletTransferParams)
    );
  }

  async mapFinalizeUnstakeParamsToWalletParams(params: () => Promise<WalletFinalizeUnstakeParams>) {
    let walletParams: WalletFinalizeUnstakeParams;
    await this.client.showPrepare();
    try {
      walletParams = await params();
    } catch (err) {
      await this.client.hideUI(['alert']);
      throw err;
    }
    return this.removeDefaultParams(
      walletParams,
      await createTransferOperation(this.formatParameters(walletParams) as WalletTransferParams)
    );
  }

  async mapIncreasePaidStorageWalletParams(params: () => Promise<WalletIncreasePaidStorageParams>) {
    let walletParams: WalletIncreasePaidStorageParams;
    await this.client.showPrepare();
    try {
      walletParams = await params();
    } catch (err) {
      await this.client.hideUI(['alert']);
      throw err;
    }

    return this.removeDefaultParams(
      walletParams,
      await createIncreasePaidStorageOperation(this.formatParameters(walletParams))
    );
  }

  async mapOriginateParamsToWalletParams(params: () => Promise<WalletOriginateParams>) {
    let walletParams: WalletOriginateParams;
    await this.client.showPrepare();
    try {
      walletParams = await params();
    } catch (err) {
      await this.client.hideUI(['alert']);
      throw err;
    }

    return this.removeDefaultParams(
      walletParams,
      await createOriginationOperation(this.formatParameters(walletParams))
    );
  }

  async mapDelegateParamsToWalletParams(params: () => Promise<WalletDelegateParams>) {
    let walletParams: WalletDelegateParams;
    await this.client.showPrepare();
    try {
      walletParams = await params();
    } catch (err) {
      await this.client.hideUI(['alert']);
      throw err;
    }

    return this.removeDefaultParams(
      walletParams,
      await createSetDelegateOperation(this.formatParameters(walletParams))
    );
  }

  async mapRegisterGlobalConstantParamsToWalletParams(
    params: () => Promise<WalletRegisterGlobalConstantParams>
  ) {
    let walletParams: WalletRegisterGlobalConstantParams;
    await this.client.showPrepare();
    try {
      walletParams = await params();
    } catch (err) {
      await this.client.hideUI(['alert']);
      throw err;
    }

    return this.removeDefaultParams(
      walletParams,
      await createRegisterGlobalConstantOperation(this.formatParameters(walletParams))
    );
  }

  formatParameters<T extends ParamsWithOptionalFees>(params: T): T {
    if (params.fee) {
      params.fee = params.fee.toString();
    }
    if (params.storageLimit) {
      params.storageLimit = params.storageLimit.toString();
    }
    if (params.gasLimit) {
      params.gasLimit = params.gasLimit.toString();
    }
    return params;
  }

  removeDefaultParams(
    params:
      | WalletTransferParams
      | WalletStakeParams
      | WalletUnstakeParams
      | WalletFinalizeUnstakeParams
      | WalletOriginateParams
      | WalletDelegateParams
      | WalletRegisterGlobalConstantParams
      | WalletTransferTicketParams
      | WalletIncreasePaidStorageParams,
    operatedParams: RPCOperationWithLimits
  ) {
    // If fee, storageLimit or gasLimit is undefined by user
    // in case of beacon wallet, dont override it by
    // defaults.
    if (!params.fee) {
      delete operatedParams.fee;
    }
    if (!params.storageLimit) {
      delete operatedParams.storage_limit;
    }
    if (!params.gasLimit) {
      delete operatedParams.gas_limit;
    }
    return operatedParams;
  }

  async sendOperations(params: any[]) {
    // One read of the session up front: the account, the predicate and the chain id all
    // come from the same instant, so nothing can shift between them.
    const session = await this.snapshotSession();
    if (!session.active) {
      throw new BeaconWalletNotInitialized();
    }
    this.validateRequiredScopesOrFail(session.active.scopes, [PermissionScope.OPERATION_REQUEST]);

    // Single-network sessions send exactly what they always sent: the wallet keeps
    // receiving a Network object rather than a CAIP-2 string.
    if (!session.isMultiNetwork) {
      const { transactionHash } = await this.client.requestOperation({ operationDetails: params });
      return transactionHash;
    }

    if (!session.activeChainId) {
      throw new BeaconActiveAccountHasNoChainId(session.active.network?.name);
    }
    await this.assertAccountUnchanged(session.active);

    const { transactionHash } = await this.client.requestOperation({
      operationDetails: params,
      network: session.activeChainId,
    });
    return transactionHash;
  }

  /**
   * Refuse to hand over a request whose account moved while it was being prepared - a user
   * picking another network from a dropdown mid-transfer.
   *
   * Compares the account identity, not just the chain id: the source address is taken from
   * the active account, so an account change within one chain matters too. The Beacon
   * client reads the active account once, at the top of the request, so checking here
   * closes the window rather than narrowing it.
   */
  private async assertAccountUnchanged(expected: AccountInfo) {
    const current = await this.client.getActiveAccount();
    if (current?.accountIdentifier !== expected.accountIdentifier) {
      throw new BeaconNetworkChangedDuringRequest(
        BeaconWallet.chainIdOf(expected) ?? 'unknown',
        current ? BeaconWallet.chainIdOf(current) : undefined
      );
    }
  }

  /**
   * Disconnect the wallet and clear the active Beacon session.
   *
   * This is the recommended way to end a user session (logout). It calls
   * `client.disconnect()` under the hood, which notifies wallet peers, clears
   * the active account, and tears down the active Beacon transports.
   *
   * After calling this method, the BeaconWallet instance can be used to
   * reconnect through a new permission request.
   *
   * For switching accounts without a full logout, use {@link clearActiveAccount} instead.
   *
   * The networks declared on the constructor are configuration, not session state, so they
   * survive this and {@link clearActiveAccount}.
   */
  async disconnect() {
    await this.client.disconnect();
    this.ungrantedNetworks = [];
  }

  /**
   * Clear the active account without destroying the Beacon session.
   *
   * This removes the active account reference from local storage but does
   * **not** clear other Beacon state such as the cached relay node
   * (`beacon:matrix-selected-node`) or peer data.
   *
   * Use this for switching between accounts within an active session.
   * For a full logout that clears all Beacon storage, use {@link disconnect} instead.
   *
   * @see {@link disconnect}
   */
  async clearActiveAccount() {
    await this.client.setActiveAccount();
  }

  async sign(bytes: string, watermark?: Uint8Array) {
    let bb = hex2buf(bytes);
    if (typeof watermark !== 'undefined') {
      bb = mergebuf(watermark, bb);
    }
    const watermarkedBytes = buf2hex(toBuffer(bb));
    const signingType = this.getSigningType(watermark);
    if (signingType !== SigningType.OPERATION) {
      throw new UnsupportedActionError(
        `octez.js Beacon Wallet currently only supports signing operations, not ${signingType}`
      );
    }
    // Gated: on a single-network session sign() keeps its existing behaviour exactly,
    // including letting the Beacon client raise "no active account" with its own UI.
    const session = await this.snapshotSession();
    if (!session.isMultiNetwork) {
      const { signature } = await this.client.requestSignPayload({
        payload: watermarkedBytes,
        signingType,
      });
      return signature;
    }

    if (!session.active) {
      throw new BeaconWalletNotInitialized();
    }
    if (!session.activeChainId) {
      throw new BeaconActiveAccountHasNoChainId(session.active.network?.name);
    }
    await this.assertAccountUnchanged(session.active);

    // requestSignPayload carries no network, so the account is pinned explicitly rather
    // than left to whichever one is active by the time the wallet reads it.
    const { signature } = await this.client.requestSignPayload({
      payload: watermarkedBytes,
      signingType,
      sourceAddress: session.active.address,
    });
    return signature;
  }

  private getSigningType(watermark?: Uint8Array) {
    if (!watermark || watermark.length === 0) {
      return SigningType.RAW;
    }
    if (watermark.length === 1) {
      if (watermark[0] === 5) {
        return SigningType.MICHELINE;
      }
      if (watermark[0] === 3) {
        return SigningType.OPERATION;
      }
    }
    throw new Error(`Invalid watermark ${JSON.stringify(watermark)}`);
  }
}
