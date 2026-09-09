import { MANAGER_LAMBDA, Protocols, TezosToolkit, getRevealFee } from '@tezos-x/octez.js';
import { Contract } from '@tezos-x/octez.js';
import { CONFIGS } from '../../config';
import { originate, originate2, transferImplicit2 } from '../../data/lambda';
import { ligoSample } from '../../data/ligo-simple-contract';
import { managerCode } from '../../data/manager_code';
import { InvalidAmountError } from '@tezos-x/octez.js-core';
import { PrefixV2 } from '@tezos-x/octez.js-utils';
import { waitForContractAt } from './contract-test-helpers';
import { expectEstimate, resolveProtocol } from './estimation-test-helpers';

CONFIGS().forEach(({ lib, setup, knownBaker, createAddress, rpc }) => {
  const Tezos = lib;
  let pkh: string;
  let protocol: Protocols;
  describe(`Test estimate scenarios using: ${rpc}`, () => {
    let LowAmountTez: TezosToolkit;
    let contract: Contract;
    let amt = 2000000

    beforeAll(async () => {
      try {
        await setup({ preferFreshKey: true, minBalanceMutez: 5_000_000 });
        protocol = resolveProtocol(await Tezos.rpc.getProtocols());
        LowAmountTez = await createAddress(PrefixV2.Secp256k1SecretKey);
        pkh = await LowAmountTez.signer.publicKeyHash();
        amt += getRevealFee(pkh);
        const transfer = await Tezos.contract.transfer({ to: pkh, mutez: true, amount: amt });
        await transfer.confirmation();
        const op = await Tezos.contract.originate({
          balance: '1',
          code: managerCode,
          init: { 'string': pkh },
        });
        await op.confirmation();
        contract = await waitForContractAt(LowAmountTez, (await op.contract()).address);
        expect(op.status).toEqual('applied');
      }
      catch (ex: any) {
        console.log(ex.message);
        throw ex;
      }
    });

    it('Verify .estimate.transfer with allocated destination', async () => {
      const estimate = await LowAmountTez.estimate.transfer({ to: await Tezos.signer.publicKeyHash(), amount: 0.019 });
      expectEstimate(estimate, protocol, {
        [Protocols.PsUshuai]: [{
          gasLimit: 2101,
          storageLimit: 0,
          suggestedFeeMutez: 390,
          burnFeeMutez: 0,
          minimalFeeMutez: 370,
          totalCost: 370,
          usingBaseFeeMutez: 370,
          consumedMilligas: 2100040,
        }],
        [Protocols.ProtoALpha]: [{
          gasLimit: 2101,
          storageLimit: 0,
          suggestedFeeMutez: 386,
          burnFeeMutez: 0,
          minimalFeeMutez: 366,
          totalCost: 366,
          usingBaseFeeMutez: 366,
          consumedMilligas: 2100040,
        }],
      });
    });

    it('Verify .estimate.transfer with unallocated destination', async () => {
      const estimate = await LowAmountTez.estimate.transfer({ to: await (await createAddress()).signer.publicKeyHash(), amount: 0.017 });
      expectEstimate(estimate, protocol, {
        [Protocols.PsUshuai]: [{
          gasLimit: 2101,
          storageLimit: 277,
          suggestedFeeMutez: 390,
          burnFeeMutez: 69250,
          minimalFeeMutez: 370,
          totalCost: 69620,
          usingBaseFeeMutez: 370,
          consumedMilligas: 2100040,
        }],
        [Protocols.ProtoALpha]: [{
          gasLimit: 2101,
          storageLimit: 277,
          suggestedFeeMutez: 386,
          burnFeeMutez: 69250,
          minimalFeeMutez: 366,
          totalCost: 69616,
          usingBaseFeeMutez: 366,
          consumedMilligas: 2100040,
        }],
      });
    });

    it('Verify .estimate.originate simple contract', async () => {
      const estimate = await LowAmountTez.estimate.originate({
        balance: '1',
        code: ligoSample,
        storage: 0,
      });
      expectEstimate(estimate, protocol, {
        [Protocols.PsUshuai]: [{
          gasLimit: 677,
          storageLimit: 591,
          suggestedFeeMutez: 539,
          burnFeeMutez: 147750,
          minimalFeeMutez: 519,
          totalCost: 148269,
          usingBaseFeeMutez: 519,
          consumedMilligas: 676402,
        }],
        [Protocols.ProtoALpha]: [{
          gasLimit: 677,
          storageLimit: 591,
          suggestedFeeMutez: 535,
          burnFeeMutez: 147750,
          minimalFeeMutez: 515,
          totalCost: 148265,
          usingBaseFeeMutez: 515,
          consumedMilligas: 676402,
        }],
      });
    });

    it('Verify .estimate.setDelegate result', async () => {
      const estimate = await LowAmountTez.estimate.setDelegate({
        delegate: knownBaker,
        source: pkh,
      });
      expectEstimate(estimate, protocol, {
        [Protocols.PsUshuai]: [{
          gasLimit: 100,
          storageLimit: 0,
          suggestedFeeMutez: 185,
          burnFeeMutez: 0,
          minimalFeeMutez: 165,
          totalCost: 165,
          usingBaseFeeMutez: 165,
          consumedMilligas: 100000,
        }],
        [Protocols.ProtoALpha]: [{
          gasLimit: 100,
          storageLimit: 0,
          suggestedFeeMutez: 181,
          burnFeeMutez: 0,
          minimalFeeMutez: 161,
          totalCost: 161,
          usingBaseFeeMutez: 161,
          consumedMilligas: 100000,
        }],
      });
    });

    it('Verify .estimate.transfer for internal transfer to allocated implicit', async () => {
      const tx = contract.methodsObject.do(MANAGER_LAMBDA.transferImplicit(knownBaker, 5)).toTransferParams();
      const estimate = await LowAmountTez.estimate.transfer(tx);
      expectEstimate(estimate, protocol, {
        [Protocols.PsUshuai]: [{
          gasLimit: 3458,
          storageLimit: 0,
          suggestedFeeMutez: 598,
          burnFeeMutez: 0,
          minimalFeeMutez: 578,
          totalCost: 578,
          usingBaseFeeMutez: 578,
          consumedMilligas: 3457645,
        }, {
          gasLimit: 3458,
          storageLimit: 0,
          suggestedFeeMutez: 596,
          burnFeeMutez: 0,
          minimalFeeMutez: 576,
          totalCost: 576,
          usingBaseFeeMutez: 576,
          consumedMilligas: 3457129,
        }, {
          gasLimit: 3458,
          storageLimit: 0,
          suggestedFeeMutez: 596,
          burnFeeMutez: 0,
          minimalFeeMutez: 576,
          totalCost: 576,
          usingBaseFeeMutez: 576,
          consumedMilligas: 3457258,
        }],
        [Protocols.ProtoALpha]: [{
          gasLimit: 3458,
          storageLimit: 0,
          suggestedFeeMutez: 594,
          burnFeeMutez: 0,
          minimalFeeMutez: 574,
          totalCost: 574,
          usingBaseFeeMutez: 574,
          consumedMilligas: 3457645,
        }, {
          gasLimit: 3458,
          storageLimit: 0,
          suggestedFeeMutez: 594,
          burnFeeMutez: 0,
          minimalFeeMutez: 574,
          totalCost: 574,
          usingBaseFeeMutez: 574,
          consumedMilligas: 3457129,
        }, {
          gasLimit: 3458,
          storageLimit: 0,
          suggestedFeeMutez: 594,
          burnFeeMutez: 0,
          minimalFeeMutez: 574,
          totalCost: 574,
          usingBaseFeeMutez: 574,
          consumedMilligas: 3457258,
        }, {
          gasLimit: 3457,
          storageLimit: 0,
          suggestedFeeMutez: 594,
          burnFeeMutez: 0,
          minimalFeeMutez: 574,
          totalCost: 574,
          usingBaseFeeMutez: 574,
          consumedMilligas: 3456484,
        }],
      });
    });

    it('Verify .estimate.transfer for multiple internal transfers to unallocated account', async () => {
      const tx = contract.methodsObject.do(transferImplicit2(
        await (await createAddress()).signer.publicKeyHash(),
        await (await createAddress()).signer.publicKeyHash(),
        50)
      ).toTransferParams();
      const estimate = await LowAmountTez.estimate.transfer(tx);
      expectEstimate(estimate, protocol, {
        [Protocols.PsUshuai]: [{
          gasLimit: 5573,
          storageLimit: 534,
          suggestedFeeMutez: 869,
          burnFeeMutez: 133500,
          minimalFeeMutez: 849,
          totalCost: 134349,
          usingBaseFeeMutez: 849,
          consumedMilligas: 5572174,
        }, {
          gasLimit: 5572,
          storageLimit: 534,
          suggestedFeeMutez: 867,
          burnFeeMutez: 133500,
          minimalFeeMutez: 847,
          totalCost: 134347,
          usingBaseFeeMutez: 847,
          consumedMilligas: 5571658,
        }, {
          gasLimit: 5572,
          storageLimit: 534,
          suggestedFeeMutez: 867,
          burnFeeMutez: 133500,
          minimalFeeMutez: 847,
          totalCost: 134347,
          usingBaseFeeMutez: 847,
          consumedMilligas: 5571787,
        }],
        [Protocols.ProtoALpha]: [{
          gasLimit: 5573,
          storageLimit: 534,
          suggestedFeeMutez: 865,
          burnFeeMutez: 133500,
          minimalFeeMutez: 845,
          totalCost: 134345,
          usingBaseFeeMutez: 845,
          consumedMilligas: 5572174,
        }, {
          gasLimit: 5572,
          storageLimit: 534,
          suggestedFeeMutez: 865,
          burnFeeMutez: 133500,
          minimalFeeMutez: 845,
          totalCost: 134345,
          usingBaseFeeMutez: 845,
          consumedMilligas: 5571658,
        }, {
          gasLimit: 5572,
          storageLimit: 534,
          suggestedFeeMutez: 865,
          burnFeeMutez: 133500,
          minimalFeeMutez: 845,
          totalCost: 134345,
          usingBaseFeeMutez: 845,
          consumedMilligas: 5571787,
        }, {
          gasLimit: 5572,
          storageLimit: 534,
          suggestedFeeMutez: 865,
          burnFeeMutez: 133500,
          minimalFeeMutez: 845,
          totalCost: 134345,
          usingBaseFeeMutez: 845,
          consumedMilligas: 5571013,
        }],
      });
    });

    it('Verify .estimate.transfer for internal origination', async () => {
      const tx = contract.methodsObject.do(originate()).toTransferParams();
      const estimate = await LowAmountTez.estimate.transfer(tx);
      expectEstimate(estimate, protocol, {
        [Protocols.PsUshuai]: [{
          gasLimit: 1869,
          storageLimit: 337,
          suggestedFeeMutez: 445,
          burnFeeMutez: 84250,
          minimalFeeMutez: 425,
          totalCost: 84675,
          usingBaseFeeMutez: 425,
          consumedMilligas: 1868269,
        }, {
          gasLimit: 1868,
          storageLimit: 337,
          suggestedFeeMutez: 443,
          burnFeeMutez: 84250,
          minimalFeeMutez: 423,
          totalCost: 84673,
          usingBaseFeeMutez: 423,
          consumedMilligas: 1867753,
        }, {
          gasLimit: 1868,
          storageLimit: 337,
          suggestedFeeMutez: 443,
          burnFeeMutez: 84250,
          minimalFeeMutez: 423,
          totalCost: 84673,
          usingBaseFeeMutez: 423,
          consumedMilligas: 1867882,
        }],
        [Protocols.ProtoALpha]: [{
          gasLimit: 1869,
          storageLimit: 337,
          suggestedFeeMutez: 441,
          burnFeeMutez: 84250,
          minimalFeeMutez: 421,
          totalCost: 84671,
          usingBaseFeeMutez: 421,
          consumedMilligas: 1868269,
        }, {
          gasLimit: 1868,
          storageLimit: 337,
          suggestedFeeMutez: 441,
          burnFeeMutez: 84250,
          minimalFeeMutez: 421,
          totalCost: 84671,
          usingBaseFeeMutez: 421,
          consumedMilligas: 1867753,
        }, {
          gasLimit: 1868,
          storageLimit: 337,
          suggestedFeeMutez: 441,
          burnFeeMutez: 84250,
          minimalFeeMutez: 421,
          totalCost: 84671,
          usingBaseFeeMutez: 421,
          consumedMilligas: 1867882,
        }, {
          gasLimit: 1868,
          storageLimit: 337,
          suggestedFeeMutez: 441,
          burnFeeMutez: 84250,
          minimalFeeMutez: 421,
          totalCost: 84671,
          usingBaseFeeMutez: 421,
          consumedMilligas: 1867108,
        }],
      });
    });

    it('Verify .estimate.transfer for multiple internal originations', async () => {
      const tx = contract.methodsObject.do(originate2()).toTransferParams();
      const estimate = await LowAmountTez.estimate.transfer(tx);
      expectEstimate(estimate, protocol, {
        [Protocols.PsUshuai]: [{
          gasLimit: 2394,
          storageLimit: 654,
          suggestedFeeMutez: 563,
          burnFeeMutez: 163500,
          minimalFeeMutez: 543,
          totalCost: 164043,
          usingBaseFeeMutez: 543,
          consumedMilligas: 2393422,
        }, {
          gasLimit: 2393,
          storageLimit: 654,
          suggestedFeeMutez: 561,
          burnFeeMutez: 163500,
          minimalFeeMutez: 541,
          totalCost: 164041,
          usingBaseFeeMutez: 541,
          consumedMilligas: 2392906,
        }, {
          gasLimit: 2394,
          storageLimit: 654,
          suggestedFeeMutez: 561,
          burnFeeMutez: 163500,
          minimalFeeMutez: 541,
          totalCost: 164041,
          usingBaseFeeMutez: 541,
          consumedMilligas: 2393035,
        }],
        [Protocols.ProtoALpha]: [{
          gasLimit: 2394,
          storageLimit: 654,
          suggestedFeeMutez: 559,
          burnFeeMutez: 163500,
          minimalFeeMutez: 539,
          totalCost: 164039,
          usingBaseFeeMutez: 539,
          consumedMilligas: 2393422,
        }, {
          gasLimit: 2393,
          storageLimit: 654,
          suggestedFeeMutez: 559,
          burnFeeMutez: 163500,
          minimalFeeMutez: 539,
          totalCost: 164039,
          usingBaseFeeMutez: 539,
          consumedMilligas: 2392906,
        }, {
          gasLimit: 2394,
          storageLimit: 654,
          suggestedFeeMutez: 559,
          burnFeeMutez: 163500,
          minimalFeeMutez: 539,
          totalCost: 164039,
          usingBaseFeeMutez: 539,
          consumedMilligas: 2393035,
        }, {
          gasLimit: 2393,
          storageLimit: 654,
          suggestedFeeMutez: 559,
          burnFeeMutez: 163500,
          minimalFeeMutez: 539,
          totalCost: 164039,
          usingBaseFeeMutez: 539,
          consumedMilligas: 2392261,
        }],
      });
      // Do the actual operation
      const op2 = await contract.methodsObject.do(originate2()).send();
      await op2.confirmation();
    });

    it('should throw error when trying to estimate transfer with negative amount in param', async () => {
      await expect(async () => {
        const est = await LowAmountTez.estimate.transfer({ to: await Tezos.signer.publicKeyHash(), amount: -1 });
      }).rejects.toThrowError(InvalidAmountError);
    });
  });


  describe(`Test estimate scenarios with very low balance using: ${rpc}`, () => {
    let LowAmountTez: TezosToolkit;
    let amt = 2000

    beforeAll(async () => {
      await setup({ preferFreshKey: true, minBalanceMutez: 5_000_000 });
      protocol = resolveProtocol(await Tezos.rpc.getProtocols());
      LowAmountTez = await createAddress(PrefixV2.Secp256k1SecretKey);
      const pkh = await LowAmountTez.signer.publicKeyHash();
      amt += getRevealFee(pkh);
      const transfer = await Tezos.contract.transfer({ to: pkh, mutez: true, amount: amt });
      await transfer.confirmation();
    });

    it('Verify .estimate.transfer to regular address', async () => {
      let estimate = await LowAmountTez.estimate.transfer({ to: await Tezos.signer.publicKeyHash(), mutez: true, amount: amt - (1382 + getRevealFee(pkh)) });
      expectEstimate(estimate, protocol, {
        [Protocols.PsUshuai]: [{
          gasLimit: 2101,
          storageLimit: 0,
          suggestedFeeMutez: 389,
          burnFeeMutez: 0,
          minimalFeeMutez: 369,
          totalCost: 369,
          usingBaseFeeMutez: 369,
          consumedMilligas: 2100040,
        }],
        [Protocols.ProtoALpha]: [{
          gasLimit: 2101,
          storageLimit: 0,
          suggestedFeeMutez: 385,
          burnFeeMutez: 0,
          minimalFeeMutez: 365,
          totalCost: 365,
          usingBaseFeeMutez: 365,
          consumedMilligas: 2100040,
        }],
      });
    });

    it('Estimate transfer to regular address with a fixed fee', async () => {

      const params = { fee: 2000, to: await Tezos.signer.publicKeyHash(), mutez: true, amount: amt - (1382 + getRevealFee(pkh)) };
      await expect(LowAmountTez.estimate.transfer(params)).rejects.toMatchObject({
        id: expect.stringContaining('empty_implicit_contract'),
      });
    });

    it('Estimate transfer to regular address with insufficient balance', async () => {
      await expect(
        LowAmountTez.estimate.transfer({ to: await Tezos.signer.publicKeyHash(), mutez: true, amount: amt })
      ).rejects.toMatchObject({
        id: expect.stringContaining('subtraction_underflow'),
      });
    });

    it('Estimate transfer to regular address with insufficient balance to pay storage for allocation', async () => {
      await expect(
        LowAmountTez.estimate.transfer({ to: await (await createAddress()).signer.publicKeyHash(), mutez: true, amount: amt - (1382 + getRevealFee(pkh)) })
      ).rejects.toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([expect.objectContaining({ id: expect.stringContaining('cannot_pay_storage_fee') })]),
          message: expect.stringContaining('subtraction_underflow'),
        }));
    });

    it('Estimate origination with insufficient balance to pay storage', async () => {
      expect(true).toBeTruthy();
      await expect(LowAmountTez.estimate.originate({
        balance: '0',
        code: ligoSample,
        storage: 0,
      })).rejects.toEqual(
        expect.objectContaining({
          errors: expect.arrayContaining([expect.objectContaining({ id: expect.stringContaining('cannot_pay_storage_fee') })]),
          message: expect.stringContaining('subtraction_underflow'),
        }));
    });
  });
});
