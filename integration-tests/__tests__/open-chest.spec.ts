import { CONFIGS } from '../config';
import { DefaultContractType } from '@tezos-x/octez.js';
import { Chest, Timelock, ChestKey } from '@tezos-x/octez.js-timelock';
import { stringToBytes } from '@tezos-x/octez.js-utils';
import { timelockCode, timelockStorage } from '../data/timelock-flip-contract';
import { sequentialTestSuite } from '../sequential-test';
import { makeSeededRng } from '../test-helpers/seeded-rng';

// please read the following link to understand the game (with guessing blocks increase from 10 to 20)
// https://gitlab.com/tezos/tezos/-/blob/master/src/proto_alpha/lib_protocol/contracts/timelock_flip.tz

CONFIGS().forEach(({ lib, rpc, setup }) => {
  const Tezos = lib;
  const time = 1024;
  const message = 'hi';
  let chestKey: ChestKey;
  // Chest/key generation otherwise draws on globalThis.crypto: a real, unseeded
  // source of randomness. A fixed seed makes every run generate the exact same
  // chest/key bytes, so a failure here reproduces identically instead of being a
  // CI-only Heisenbug. Each call site below gets its OWN literal seed constant
  // -- not a shared incrementing counter -- so a step's bytes are the same
  // whether the whole file runs or the step is isolated with `vitest -t`, and
  // so two independently-generated chest/key pairs can never share PRNG state.
  const INIT_GAME_CHEST_SEED = 1;
  const WRONG_GUESS_PRECOMPUTE_SEED = 2;
  const WRONG_GUESS_CHEST_SEED = 3;
  const WRONG_KEY_CHEST_SEED = 4;
  const WRONG_KEY_MISMATCHED_KEY_SEED = 5;

  describe(`Timelock test coin flip contract ${rpc}`, () => {
    const step = sequentialTestSuite();
    let contract: DefaultContractType;
    beforeAll(async () => {
      await setup({ preferFreshKey: true, minBalanceMutez: 5_000_000 });
      const originate = await Tezos.contract.originate({
        code: timelockCode,
        init: timelockStorage,
      });
      await originate.confirmation();
      contract = await originate.contract();
      const storageB4: any = await contract.storage();

      expect(storageB4.level.toNumber()).toBe(0);
      expect(storageB4.guess).toBe('ff');
      expect(storageB4.result).toBe('ff');
    });

    step('should be able to initialize the game with chest', async () => {
      const payload = new TextEncoder().encode(message);
      const { chest, key } = Chest.newChestAndKey(
        payload,
        time,
        undefined,
        makeSeededRng(INIT_GAME_CHEST_SEED)
      );
      chestKey = key;
      let init = await contract.methodsObject.initialize_game(chest.encode()).send();
      await init.confirmation();
      const storageInit: any = await contract.storage();

      expect(storageInit.level.toNumber()).toBeGreaterThan(0);
      expect(storageInit.guess).toBe('a0');
      expect(storageInit.result).toBe('a0');
    });

    step('should be able to guess right', async () => {
      let guess1 = await contract.methodsObject.guess(stringToBytes(message)).send();
      await guess1.confirmation();
      const storageGuess: any = await contract.storage();

      expect(storageGuess.guess).toBe(stringToBytes(message));
      expect(storageGuess.result).toBe('b0');
    });

    step('should be able to finish/unlock the game', async () => {
      let finish = await contract.methodsObject.finish_game(chestKey.encode()).send();
      await finish.confirmation();
      const storageFinish: any = await contract.storage();

      expect(storageFinish.guess).toBe(stringToBytes(message));
      expect(storageFinish.result).toBe('00');
    });

    step('should be able to guess wrong', async () => {
      const payload = new TextEncoder().encode(message);
      const precomputedTimelock = Timelock.precompute(
        time,
        undefined,
        makeSeededRng(WRONG_GUESS_PRECOMPUTE_SEED)
      );
      const { chest, key } = Chest.fromTimelock(
        payload,
        time,
        precomputedTimelock,
        makeSeededRng(WRONG_GUESS_CHEST_SEED)
      );
      chestKey = key;
      let init = await contract.methodsObject.initialize_game(chest.encode()).send();
      await init.confirmation();
      const storageInit: any = await contract.storage();

      expect(storageInit.level.toNumber()).toBeGreaterThan(0);
      expect(storageInit.guess).toBe('a0');
      expect(storageInit.result).toBe('a0');

      let guess1 = await contract.methodsObject.guess(stringToBytes('bad')).send();
      await guess1.confirmation();
      const storageGuess: any = await contract.storage();

      expect(storageGuess.guess).toBe(stringToBytes('bad'));
      expect(storageGuess.result).toBe('b0');
    });

    step('should be able to finish/unlock the wrong guess game', async () => {
      let finish = await contract.methodsObject.finish_game(chestKey.encode()).send();
      await finish.confirmation();
      const storageFinish: any = await contract.storage();

      expect(storageFinish.guess).toBe(stringToBytes('bad'));
      expect(storageFinish.result).toBe('01');
    });

    step(`shouldn't unlock the game with wrong key`, async () => {
      const originate = await Tezos.contract.originate({
        code: timelockCode,
        init: timelockStorage,
      });
      await originate.confirmation();
      const isolatedContract = await originate.contract();

      const payload = new TextEncoder().encode(message);
      const { chest } = Chest.newChestAndKey(
        payload,
        time,
        undefined,
        makeSeededRng(WRONG_KEY_CHEST_SEED)
      );
      const init = await isolatedContract.methodsObject.initialize_game(chest.encode()).send();
      await init.confirmation();
      expect(init.status).toBe('applied');
      const storageInit: any = await isolatedContract.storage();

      expect(storageInit.level.toNumber()).toBeGreaterThan(0);
      expect(storageInit.guess).toBe('a0');
      expect(storageInit.result).toBe('a0');

      // A DIFFERENT seed on purpose: this key must NOT match the chest above --
      // the point of this step is proving a mismatched key fails to open it.
      const { key } = Chest.newChestAndKey(
        payload,
        time,
        undefined,
        makeSeededRng(WRONG_KEY_MISMATCHED_KEY_SEED)
      );
      const finish = await isolatedContract.methodsObject.finish_game(key.encode()).send();
      await finish.confirmation();
      expect(finish.status).toBe('applied');
      const storageFinish: any = await isolatedContract.storage();

      expect(storageFinish.guess).toBe('a0');
      expect(storageFinish.result).toBe('10');
    });
  });
});
