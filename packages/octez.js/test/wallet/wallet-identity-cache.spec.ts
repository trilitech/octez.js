import { TezosToolkit } from '../../src/octez';
import { WalletProvider } from '../../src/wallet/interface';

/**
 * The PKH/PK a `Wallet` reads from its provider is cached and never expires on its own.
 * That cache has to be discarded whenever a wallet provider is installed, otherwise a
 * provider swap - or a multi-network wallet switching the chain it targets - keeps
 * serving the previous account's address.
 *
 * Two `Wallet` instances cache independently: the one behind `TezosToolkit.wallet` and
 * the one owned by the `Context`, which is what the estimation and preparation paths
 * read. Both must be flushed.
 */
describe('Wallet identity cache', () => {
  const makeProvider = (pkh: string, pk: string): WalletProvider =>
    ({
      getPKH: vi.fn().mockResolvedValue(pkh),
      getPK: vi.fn().mockResolvedValue(pk),
    }) as unknown as WalletProvider;

  let toolkit: TezosToolkit;
  let first: WalletProvider;

  const contextWallet = (t: TezosToolkit) => (t as any)._context.wallet;

  beforeEach(() => {
    toolkit = new TezosToolkit('http://127.0.0.1:8732');
    first = makeProvider('tz1first', 'edpkfirst');
    toolkit.setWalletProvider(first);
  });

  it('caches the pkh so a second read does not hit the provider again', async () => {
    expect(await toolkit.wallet.pkh()).toEqual('tz1first');
    expect(await toolkit.wallet.pkh()).toEqual('tz1first');
    expect(first.getPKH).toHaveBeenCalledTimes(1);
  });

  it('caches the pk so a second read does not hit the provider again', async () => {
    expect(await toolkit.wallet.pk()).toEqual('edpkfirst');
    expect(await toolkit.wallet.pk()).toEqual('edpkfirst');
    expect(first.getPK).toHaveBeenCalledTimes(1);
  });

  it('re-reads the pkh after another provider is installed', async () => {
    expect(await toolkit.wallet.pkh()).toEqual('tz1first');

    toolkit.setWalletProvider(makeProvider('tz1second', 'edpksecond'));

    expect(await toolkit.wallet.pkh()).toEqual('tz1second');
  });

  it('re-reads the pk after another provider is installed', async () => {
    expect(await toolkit.wallet.pk()).toEqual('edpkfirst');

    toolkit.setWalletProvider(makeProvider('tz1second', 'edpksecond'));

    expect(await toolkit.wallet.pk()).toEqual('edpksecond');
  });

  it('flushes the Context-owned Wallet too, not just TezosToolkit.wallet', async () => {
    // The estimation and preparation paths read through context.wallet, so a fix that
    // only flushed TezosToolkit.wallet would still build operations for the old address.
    expect(await contextWallet(toolkit).pkh()).toEqual('tz1first');

    toolkit.setWalletProvider(makeProvider('tz1second', 'edpksecond'));

    expect(await contextWallet(toolkit).pkh()).toEqual('tz1second');
  });

  it('flushes when the SAME provider instance is re-installed', async () => {
    // A multi-network wallet re-installs itself to move the toolkit onto another chain,
    // so the incoming provider is reference-equal to the installed one. Conditioning the
    // flush on the provider "differing" would make it never fire on the one call that
    // needs it.
    expect(await toolkit.wallet.pkh()).toEqual('tz1first');
    (first.getPKH as any).mockResolvedValue('tz1otherchain');

    toolkit.setProvider({ rpc: 'http://127.0.0.1:8732', wallet: first });

    expect(await toolkit.wallet.pkh()).toEqual('tz1otherchain');
  });

  it('does not flush on setProvider({ rpc }) when a provider is already installed', async () => {
    expect(await toolkit.wallet.pkh()).toEqual('tz1first');

    toolkit.setProvider({ rpc: 'http://127.0.0.1:9999' });

    expect(await toolkit.wallet.pkh()).toEqual('tz1first');
    expect(first.getPKH).toHaveBeenCalledTimes(1);
  });

  it('does not flush on setProvider({ config }) when a provider is already installed', async () => {
    expect(await toolkit.wallet.pkh()).toEqual('tz1first');

    toolkit.setProvider({ config: { confirmationPollingTimeoutSecond: 1 } });

    expect(await toolkit.wallet.pkh()).toEqual('tz1first');
    expect(first.getPKH).toHaveBeenCalledTimes(1);
  });

  it('still honours forceRefetch', async () => {
    expect(await toolkit.wallet.pkh()).toEqual('tz1first');
    (first.getPKH as any).mockResolvedValue('tz1refetched');

    expect(await toolkit.wallet.pkh({ forceRefetch: true })).toEqual('tz1refetched');
  });
});
