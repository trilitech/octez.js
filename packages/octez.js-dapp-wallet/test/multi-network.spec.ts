import { vi } from 'vitest';
import {
  BeaconInvalidNetwork,
  BeaconNetworkChangedDuringRequest,
  BeaconNetworkRpcUrlUnknown,
  BeaconNetworkSwitchFailed,
  BeaconWallet,
  BeaconWalletNotInitialized,
} from '../src/octez.js-dapp-wallet';
import LocalStorageMock from './mock-local-storage';
import { PermissionScope } from '@tezos-x/octez.connect-dapp';
import { indexedDB } from 'fake-indexeddb';

global.localStorage = new LocalStorageMock();
global.indexedDB = indexedDB;
global.window = { addEventListener: vi.fn() } as any;

vi.mock('broadcast-channel', async () => {
  return await import('./__mocks__/broadcast-channel');
});

vi.mock('@stablelib/random', () => ({
  randomBytes: (n: number) => new Uint8Array(n).fill(1),
  SystemRandomSource: vi.fn().mockImplementation(() => ({
    randomBytes: (n: number) => new Uint8Array(n).fill(1),
  })),
}));

vi.mock('@tezos-x/octez.connect-dapp', async () => {
  const originalModule =
    await vi.importActual<typeof import('@tezos-x/octez.connect-dapp')>(
      '@tezos-x/octez.connect-dapp'
    );

  return {
    ...originalModule,
    getDAppClientInstance: vi.fn().mockImplementation(() => ({
      requestPermissions: vi.fn(),
      requestOperation: vi.fn().mockResolvedValue({ transactionHash: 'ophash' }),
      requestSignPayload: vi.fn().mockResolvedValue({ signature: 'edsig' }),
      getActiveAccount: vi.fn(),
      setActiveAccount: vi.fn(),
      getAccounts: vi.fn().mockResolvedValue([]),
      showPrepare: vi.fn(),
      hideUI: vi.fn(),
      disconnect: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

vi.mock('@tezos-x/octez.connect-ui', () => ({
  AlertButton: vi.fn(),
  closeToast: vi.fn(),
  getColorMode: vi.fn(),
  setColorMode: vi.fn(),
  setDesktopList: vi.fn(),
  setExtensionList: vi.fn(),
  setWebList: vi.fn(),
  setiOSList: vi.fn(),
  getiOSList: vi.fn(),
  getDesktopList: vi.fn(),
  getExtensionList: vi.fn(),
  getWebList: vi.fn(),
  isBrowser: vi.fn(),
  isDesktop: vi.fn(),
  isMobileOS: vi.fn(),
  isIOS: vi.fn(),
  currentOS: vi.fn(),
}));

vi.mock('@tezos-x/octez.connect-transport-postmessage', async () => {
  const originalModule = await vi.importActual<
    typeof import('@tezos-x/octez.connect-transport-postmessage')
  >('@tezos-x/octez.connect-transport-postmessage');

  return {
    ...originalModule,
    PostMessageTransport: vi.fn().mockImplementation(() => ({
      connect: vi.fn(),
      startOpenChannelListener: vi.fn(),
      getPairingRequestInfo: vi.fn(),
      listen: vi.fn(),
    })),
    getAvailableExtensions: vi.fn(),
  };
});

const MAINNET = 'tezos:NetXdQprcVkpaWU';
const SHADOWNET = 'tezos:NetXsqzbfFenSTS';
const MAINNET_RPC = 'https://tezos-mainnet.octez.io';
const SHADOWNET_RPC = 'https://tezos-shadownet.octez.io';

const account = (chainId: string | undefined, address: string, extra: any = {}) => ({
  accountIdentifier: `${address}-${chainId ?? 'legacy'}`,
  senderId: 'sender-1',
  address,
  publicKey: `edpk-${address}`,
  scopes: [PermissionScope.OPERATION_REQUEST, PermissionScope.SIGN],
  network: chainId ? { type: 'custom', name: chainId, chainId } : { type: 'mainnet' },
  ...extra,
});

const MAINNET_ACCOUNT = account(MAINNET, 'tz1mainnet');
const SHADOWNET_ACCOUNT = account(SHADOWNET, 'tz1shadownet');

/** A BeaconWallet whose mocked client reports the given session. */
const walletWith = (accounts: any[], active: any, networks = declaredNetworks()) => {
  const wallet = new BeaconWallet({ name: 'Test', networks });
  const client = wallet.client as any;
  client.getAccounts.mockResolvedValue(accounts);
  client.getActiveAccount.mockResolvedValue(active);
  return { wallet, client };
};

const declaredNetworks = () => [
  { chainId: MAINNET, rpcUrl: MAINNET_RPC, name: 'Mainnet' },
  { chainId: SHADOWNET, rpcUrl: SHADOWNET_RPC },
];

describe('BeaconWallet multi-network', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).beaconCreatedClientInstance;
  });

  describe('declaring networks', () => {
    it('does not forward the octez.js-only `networks` option to the Beacon client', async () => {
      const { getDAppClientInstance } = await import('@tezos-x/octez.connect-dapp');
      new BeaconWallet({ name: 'Test', networks: declaredNetworks() });

      const passed = (getDAppClientInstance as any).mock.calls.at(-1)[0];
      expect(Object.prototype.hasOwnProperty.call(passed, 'networks')).toBe(false);
      expect(passed.name).toEqual('Test');
    });

    it('accepts a bare chain id and normalizes it to CAIP-2', async () => {
      const { wallet, client } = walletWith([], undefined, [
        { chainId: 'NetXdQprcVkpaWU', rpcUrl: MAINNET_RPC },
      ]);

      await wallet.requestPermissions();

      expect(client.requestPermissions.mock.calls[0][0].networks).toEqual([
        { chainId: MAINNET, rpcUrl: MAINNET_RPC },
      ]);
    });

    it('rejects a malformed chain id at construction', () => {
      expect(() => new BeaconWallet({ name: 'Test', networks: [{ chainId: 'not a chain!' }] })).toThrow(
        BeaconInvalidNetwork
      );
    });

    it('requests the declared networks when none are passed', async () => {
      const { wallet, client } = walletWith([], undefined);

      await wallet.requestPermissions();

      expect(client.requestPermissions.mock.calls[0][0].networks).toHaveLength(2);
    });

    it('injects the declared networks alongside an explicit scopes-only argument', async () => {
      const { wallet, client } = walletWith([], undefined);

      await wallet.requestPermissions({ scopes: [PermissionScope.SIGN] });

      const input = client.requestPermissions.mock.calls[0][0];
      expect(input.scopes).toEqual([PermissionScope.SIGN]);
      expect(input.networks).toHaveLength(2);
    });

    it('lets an explicit networks argument narrow the request', async () => {
      const { wallet, client } = walletWith([], undefined);

      await wallet.requestPermissions({ networks: [{ chainId: MAINNET }] });

      expect(client.requestPermissions.mock.calls[0][0].networks).toEqual([{ chainId: MAINNET }]);
    });

    it('sends no networks key at all when the dApp declared none', async () => {
      const { wallet, client } = walletWith([], undefined, []);

      await wallet.requestPermissions();

      expect(client.requestPermissions.mock.calls[0][0]).toBeUndefined();
    });

    it('keeps a declared rpcUrl usable after the request was narrowed to a subset', async () => {
      const { wallet, client } = walletWith([], undefined);
      await wallet.requestPermissions({ networks: [{ chainId: SHADOWNET }] });

      client.getAccounts.mockResolvedValue([MAINNET_ACCOUNT, SHADOWNET_ACCOUNT]);
      client.getActiveAccount.mockResolvedValue(MAINNET_ACCOUNT);

      const networks = await wallet.getNetworks();
      expect(networks.find((n) => n.chainId === SHADOWNET)?.rpcUrl).toEqual(SHADOWNET_RPC);
    });
  });

  describe('reporting partial grants', () => {
    it('warns and exposes the chains the wallet did not grant', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { wallet, client } = walletWith([], undefined);
      client.getAccounts.mockResolvedValue([MAINNET_ACCOUNT]);
      client.getActiveAccount.mockResolvedValue(MAINNET_ACCOUNT);

      await wallet.requestPermissions();

      expect(wallet.getUngrantedNetworks()).toEqual([SHADOWNET]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(SHADOWNET));
      warn.mockRestore();
    });

    it('stays quiet when every declared chain was granted', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { wallet, client } = walletWith([], undefined);
      client.getAccounts.mockResolvedValue([MAINNET_ACCOUNT, SHADOWNET_ACCOUNT]);
      client.getActiveAccount.mockResolvedValue(MAINNET_ACCOUNT);

      await wallet.requestPermissions();

      expect(wallet.getUngrantedNetworks()).toEqual([]);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('enumerating networks', () => {
    it('lists every granted chain with the dApp-declared rpcUrl', async () => {
      const { wallet } = walletWith([MAINNET_ACCOUNT, SHADOWNET_ACCOUNT], MAINNET_ACCOUNT);

      expect(await wallet.getNetworks()).toEqual([
        { chainId: MAINNET, name: 'Mainnet', rpcUrl: MAINNET_RPC, walletRpcUrl: undefined },
        { chainId: SHADOWNET, name: SHADOWNET, rpcUrl: SHADOWNET_RPC, walletRpcUrl: undefined },
      ]);
      expect(await wallet.isMultiNetwork()).toBe(true);
    });

    it("prefers the dApp's rpcUrl over the wallet's, while keeping the wallet's visible", async () => {
      const walletSupplied = {
        ...MAINNET_ACCOUNT,
        network: { type: 'custom', chainId: MAINNET, rpcUrl: 'https://wallet-node.example' },
      };
      const { wallet } = walletWith([walletSupplied], walletSupplied);

      const [entry] = await wallet.getNetworks();
      expect(entry.rpcUrl).toEqual(MAINNET_RPC);
      expect(entry.walletRpcUrl).toEqual('https://wallet-node.example');
    });

    it('falls back to the wallet rpcUrl for a chain the dApp did not declare', async () => {
      const undeclared = account('tezos:NetXnHfVqm9iesp', 'tz1ghost', {
        network: {
          type: 'custom',
          chainId: 'tezos:NetXnHfVqm9iesp',
          rpcUrl: 'https://wallet-node.example',
        },
      });
      const { wallet } = walletWith([undeclared], undeclared);

      expect((await wallet.getNetworks())[0].rpcUrl).toEqual('https://wallet-node.example');
    });

    it('synthesizes one entry for a legacy session carrying no chain id', async () => {
      const legacy = account(undefined, 'tz1legacy');
      const { wallet } = walletWith([legacy], legacy);

      const networks = await wallet.getNetworks();
      expect(networks).toHaveLength(1);
      expect(networks[0].chainId).toEqual(MAINNET);
      expect(await wallet.isMultiNetwork()).toBe(false);
    });

    it('omits chainId when the legacy network has no known genesis id', async () => {
      const legacy = account(undefined, 'tz1legacy', { network: { type: 'tallinnnet' } });
      const { wallet } = walletWith([legacy], legacy);

      const [entry] = await wallet.getNetworks();
      expect(Object.prototype.hasOwnProperty.call(entry, 'chainId')).toBe(false);
      expect(entry.name).toEqual('tallinnnet');
    });

    it('returns an empty array rather than throwing before any pairing', async () => {
      const { wallet } = walletWith([], undefined);

      expect(await wallet.getNetworks()).toEqual([]);
      expect(await wallet.getActiveNetwork()).toBeUndefined();
    });

    it('ignores accounts belonging to a different pairing', async () => {
      const stale = { ...SHADOWNET_ACCOUNT, senderId: 'a-dead-pairing' };
      const { wallet } = walletWith([MAINNET_ACCOUNT, stale], MAINNET_ACCOUNT);

      expect((await wallet.getNetworks()).map((n) => n.chainId)).toEqual([MAINNET]);
    });
  });

  describe('switching the targeted network', () => {
    const toolkitStub = () => ({ setProvider: vi.fn() }) as any;

    it('moves the active account and re-points the toolkit', async () => {
      const { wallet, client } = walletWith([MAINNET_ACCOUNT, SHADOWNET_ACCOUNT], MAINNET_ACCOUNT);
      client.getActiveAccount
        .mockResolvedValueOnce(MAINNET_ACCOUNT)
        .mockResolvedValue(SHADOWNET_ACCOUNT);
      const toolkit = toolkitStub();

      await wallet.setActiveNetwork(SHADOWNET, { toolkit });

      expect(client.setActiveAccount).toHaveBeenCalledWith(SHADOWNET_ACCOUNT);
      expect(toolkit.setProvider).toHaveBeenCalledWith({ rpc: SHADOWNET_RPC, wallet });
    });

    it('accepts a bare chain id', async () => {
      const { wallet, client } = walletWith([MAINNET_ACCOUNT, SHADOWNET_ACCOUNT], MAINNET_ACCOUNT);
      client.getActiveAccount
        .mockResolvedValueOnce(MAINNET_ACCOUNT)
        .mockResolvedValue(SHADOWNET_ACCOUNT);

      await wallet.setActiveNetwork('NetXsqzbfFenSTS');

      expect(client.setActiveAccount).toHaveBeenCalledWith(SHADOWNET_ACCOUNT);
    });

    it('passes a custom read provider through so it is not silently replaced', async () => {
      const { wallet, client } = walletWith([MAINNET_ACCOUNT, SHADOWNET_ACCOUNT], MAINNET_ACCOUNT);
      client.getActiveAccount
        .mockResolvedValueOnce(MAINNET_ACCOUNT)
        .mockResolvedValue(SHADOWNET_ACCOUNT);
      const toolkit = toolkitStub();
      const readProvider = { name: 'indexer' } as any;

      await wallet.setActiveNetwork(SHADOWNET, { toolkit, readProvider });

      expect(toolkit.setProvider).toHaveBeenCalledWith({
        rpc: SHADOWNET_RPC,
        wallet,
        readProvider,
      });
    });

    it('rejects a chain that is not part of the session, moving nothing', async () => {
      const { wallet, client } = walletWith([MAINNET_ACCOUNT], MAINNET_ACCOUNT);
      const toolkit = toolkitStub();

      await expect(wallet.setActiveNetwork(SHADOWNET, { toolkit })).rejects.toThrow(
        BeaconInvalidNetwork
      );
      expect(client.setActiveAccount).not.toHaveBeenCalled();
      expect(toolkit.setProvider).not.toHaveBeenCalled();
    });

    it('refuses to move when a toolkit was passed but no rpcUrl is known', async () => {
      const undeclared = account('tezos:NetXnHfVqm9iesp', 'tz1ghost');
      const { wallet, client } = walletWith([MAINNET_ACCOUNT, undeclared], MAINNET_ACCOUNT);
      const toolkit = toolkitStub();

      await expect(
        wallet.setActiveNetwork('tezos:NetXnHfVqm9iesp', { toolkit })
      ).rejects.toThrow(BeaconNetworkRpcUrlUnknown);
      expect(client.setActiveAccount).not.toHaveBeenCalled();
      expect(toolkit.setProvider).not.toHaveBeenCalled();
    });

    it('moves the wallet only when no toolkit is passed, even with no rpcUrl', async () => {
      const undeclared = account('tezos:NetXnHfVqm9iesp', 'tz1ghost');
      const { wallet, client } = walletWith([MAINNET_ACCOUNT, undeclared], MAINNET_ACCOUNT);
      client.getActiveAccount.mockResolvedValueOnce(MAINNET_ACCOUNT).mockResolvedValue(undeclared);

      await wallet.setActiveNetwork('tezos:NetXnHfVqm9iesp');

      expect(client.setActiveAccount).toHaveBeenCalledWith(undeclared);
    });

    it('is a no-op when the target chain is already active', async () => {
      const { wallet, client } = walletWith([MAINNET_ACCOUNT, SHADOWNET_ACCOUNT], MAINNET_ACCOUNT);
      const toolkit = toolkitStub();

      await wallet.setActiveNetwork(MAINNET, { toolkit });

      expect(client.setActiveAccount).not.toHaveBeenCalled();
      expect(toolkit.setProvider).not.toHaveBeenCalled();
    });

    it('reports a switch the wallet silently declined to apply', async () => {
      const { wallet, client } = walletWith([MAINNET_ACCOUNT, SHADOWNET_ACCOUNT], MAINNET_ACCOUNT);
      client.getActiveAccount.mockResolvedValue(MAINNET_ACCOUNT); // never moves

      await expect(wallet.setActiveNetwork(SHADOWNET)).rejects.toThrow(BeaconNetworkSwitchFailed);
    });

    it('restores the previous account when re-pointing the toolkit throws', async () => {
      const { wallet, client } = walletWith([MAINNET_ACCOUNT, SHADOWNET_ACCOUNT], MAINNET_ACCOUNT);
      client.getActiveAccount
        .mockResolvedValueOnce(MAINNET_ACCOUNT)
        .mockResolvedValue(SHADOWNET_ACCOUNT);
      const toolkit = {
        setProvider: vi.fn().mockImplementation(() => {
          throw new Error('bad rpc');
        }),
      } as any;

      await expect(wallet.setActiveNetwork(SHADOWNET, { toolkit })).rejects.toThrow('bad rpc');
      expect(client.setActiveAccount).toHaveBeenLastCalledWith(MAINNET_ACCOUNT);
    });

    it('requires a paired wallet', async () => {
      const { wallet } = walletWith([], undefined);

      await expect(wallet.setActiveNetwork(MAINNET)).rejects.toThrow(BeaconWalletNotInitialized);
    });
  });

  describe('sending operations', () => {
    it('routes the operation to the targeted chain', async () => {
      const { wallet, client } = walletWith([MAINNET_ACCOUNT, SHADOWNET_ACCOUNT], SHADOWNET_ACCOUNT);

      expect(await wallet.sendOperations([{ kind: 'transaction' }])).toEqual('ophash');
      expect(client.requestOperation).toHaveBeenCalledWith({
        operationDetails: [{ kind: 'transaction' }],
        network: SHADOWNET,
      });
    });

    it('sets no network property at all on a single-network session', async () => {
      const { wallet, client } = walletWith([MAINNET_ACCOUNT], MAINNET_ACCOUNT);

      await wallet.sendOperations([{ kind: 'transaction' }]);

      const input = client.requestOperation.mock.calls[0][0];
      // hasOwnProperty, not toBeUndefined: `{ network: undefined }` is still a wire change.
      expect(Object.prototype.hasOwnProperty.call(input, 'network')).toBe(false);
    });

    it('sets no network property on a legacy session carrying no chain ids', async () => {
      const legacy = account(undefined, 'tz1legacy');
      const { wallet, client } = walletWith([legacy], legacy);

      await wallet.sendOperations([{ kind: 'transaction' }]);

      const input = client.requestOperation.mock.calls[0][0];
      expect(Object.prototype.hasOwnProperty.call(input, 'network')).toBe(false);
    });

    it('refuses to send when the network moved while the request was being prepared', async () => {
      const { wallet, client } = walletWith([MAINNET_ACCOUNT, SHADOWNET_ACCOUNT], MAINNET_ACCOUNT);
      client.getActiveAccount
        .mockResolvedValueOnce(MAINNET_ACCOUNT) // sendOperations entry
        .mockResolvedValueOnce(MAINNET_ACCOUNT) // capture
        .mockResolvedValue(SHADOWNET_ACCOUNT); // moved before hand-off

      await expect(wallet.sendOperations([{ kind: 'transaction' }])).rejects.toThrow(
        BeaconNetworkChangedDuringRequest
      );
      expect(client.requestOperation).not.toHaveBeenCalled();
    });

    it('still requires the operation scope', async () => {
      const scopeless = { ...MAINNET_ACCOUNT, scopes: [PermissionScope.SIGN] };
      const { wallet } = walletWith([scopeless], scopeless);

      await expect(wallet.sendOperations([{ kind: 'transaction' }])).rejects.toThrow(
        'Required permissions scopes'
      );
    });
  });

  describe('signing', () => {
    const OPERATION_WATERMARK = new Uint8Array([3]);

    it('pins the source address on a multi-network session', async () => {
      const { wallet, client } = walletWith([MAINNET_ACCOUNT, SHADOWNET_ACCOUNT], SHADOWNET_ACCOUNT);

      expect(await wallet.sign('1234', OPERATION_WATERMARK)).toEqual('edsig');
      expect(client.requestSignPayload.mock.calls[0][0].sourceAddress).toEqual('tz1shadownet');
    });

    it('sends no sourceAddress on a single-network session', async () => {
      const { wallet, client } = walletWith([MAINNET_ACCOUNT], MAINNET_ACCOUNT);

      await wallet.sign('1234', OPERATION_WATERMARK);

      const input = client.requestSignPayload.mock.calls[0][0];
      expect(Object.prototype.hasOwnProperty.call(input, 'sourceAddress')).toBe(false);
    });

    it('refuses to sign when the network moved while the request was being prepared', async () => {
      const { wallet, client } = walletWith([MAINNET_ACCOUNT, SHADOWNET_ACCOUNT], MAINNET_ACCOUNT);
      client.getActiveAccount
        .mockResolvedValueOnce(MAINNET_ACCOUNT) // account read
        .mockResolvedValueOnce(MAINNET_ACCOUNT) // capture
        .mockResolvedValue(SHADOWNET_ACCOUNT); // moved before hand-off

      await expect(wallet.sign('1234', OPERATION_WATERMARK)).rejects.toThrow(
        BeaconNetworkChangedDuringRequest
      );
      expect(client.requestSignPayload).not.toHaveBeenCalled();
    });
  });
});
