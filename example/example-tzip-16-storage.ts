import { MichelsonMap, TezosToolkit } from '@tezos-x/octez.js';
import { tacoContractTzip16 } from "../integration-tests/data/modified-taco-contract"
import { stringToBytes } from '@tezos-x/octez.js-utils';
import { InMemorySigner } from '@tezos-x/octez.js-signer';

async function example() {
  const provider = 'https://rpc.ghostnet.teztnets.com';
  const signer = new InMemorySigner('edskRtmEwZxRzwd1obV9pJzAoLoxXFWTSHbgqpDBRHx1Ktzo5yVuJ37e2R4nzjLnNbxFU4UiBU1iHzAy52pK5YBRpaFwLbByca');
  const tezos = new TezosToolkit(provider);
  tezos.setSignerProvider(signer);

  try {
    console.log('Deploying Tzip16Storage contract...');

    const metadataJSON = {
      "name": "test",
      "description": "A metadata test",
      "version": "0.1",
      "license": "MIT",
      "authors": [
        "octez.js <https://octez.js.dev/>"
      ],
      "homepage": "https://octez.js.dev/"
    };

    const metadataBigMap = new MichelsonMap();
    metadataBigMap.set("", stringToBytes('tezos-storage:here'));
    metadataBigMap.set("here", stringToBytes(JSON.stringify(metadataJSON)))

    // Ligo Taco shop contract modified to include metadata in storage
    // https://ide.ligolang.org/p/-uS469slzUlSm1zwNqHl1A

    const tacoShopStorageMap = new MichelsonMap();

    const op = await tezos.contract.originate({
      code: tacoContractTzip16,
      storage: {
        metadata: metadataBigMap,
        taco_shop_storage: tacoShopStorageMap
      },
    });

    console.log('Awaiting confirmation...');
    const contract = await op.contract();
    console.log('Tzip16Storage Contract address', contract.address)
    console.log('Gas Used', op.consumedGas);
    console.log('Storage Paid', op.storageDiff);
    console.log('Storage Size', op.storageSize);
    console.log('Storage', await contract.storage());
    console.log('Operation hash:', op.hash, 'Included in block level:', op.includedInBlock);
  } catch (ex) {
    console.error(ex);
  }
}

example();
