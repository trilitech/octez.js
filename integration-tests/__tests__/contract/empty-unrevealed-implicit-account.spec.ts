import { CONFIGS } from '../../config';
import { revealFeeMutez } from './estimation-test-helpers';

CONFIGS().forEach(({ lib, rpc, setup, createAddress }) => {
  const Tezos = lib;
  describe(`Test emptying an unrevealed implicit account through contract api using: ${rpc}`, () => {
    beforeEach(async () => {
      await setup({ preferFreshKey: true, minBalanceMutez: 5_000_000 });
    });

    it('Verify that a new unrevealed implicit account can be created, funded and emptied through contract api', async () => {
      const LocalTez = await createAddress();
      const op = await Tezos.contract.transfer({
        to: await LocalTez.signer.publicKeyHash(),
        amount: 0.01,
      });
      await op.confirmation();

      const pkh = await LocalTez.signer.publicKeyHash();
      const balance = await Tezos.tz.getBalance(pkh);
      // The actual reveal fee this account will be charged, not the static
      // getRevealFee() table — that table is only a fallback for when
      // mempool/filter is unavailable (see prepare-provider.ts's
      // getRevealLimits) and no longer matches what gets charged on a
      // healthy node since the reveal-pricing fix in cf6e324fa. This test
      // relies on emptying the account to exactly 0, so it needs the real
      // value.
      const revealFee = await revealFeeMutez(LocalTez, pkh);
      const estimate = await LocalTez.estimate.transfer({
        to: await Tezos.signer.publicKeyHash(),
        mutez: true,
        amount: balance.minus(revealFee).toNumber(),
      });

      const op3 = await LocalTez.contract.transfer({
        to: await Tezos.signer.publicKeyHash(),
        mutez: true,
        amount: balance.minus(estimate.suggestedFeeMutez + revealFee).toNumber(),
        fee: estimate.suggestedFeeMutez,
        gasLimit: estimate.gasLimit,
        storageLimit: 0,
      });
      await op3.confirmation();

      expect(op3.status).toEqual('applied');
      expect((await Tezos.tz.getBalance(pkh)).toString()).toEqual('0');
    });
  });
});
