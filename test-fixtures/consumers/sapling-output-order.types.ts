/// <reference types="node" />

import { SaplingToolkit, InMemorySpendingKey } from '@tezos-x/octez.js-sapling';
import { RpcClient } from '@tezos-x/octez.js-rpc';
import { RpcReadAdapter } from '@tezos-x/octez.js';

declare const saplingSigner: InMemorySpendingKey;
const readProvider = new RpcReadAdapter(new RpcClient('https://example.invalid'));
const keys = { saplingSigner };
const contract = { contractAddress: 'KT1G2kvdfPoavgR6Fjdd68M2vaPk14qJ8bhC', memoSize: 8 };

new SaplingToolkit(keys, contract, readProvider);
new SaplingToolkit(keys, { ...contract, outputOrder: 'preserve' }, readProvider);
new SaplingToolkit(keys, { ...contract, outputOrder: 'randomized' }, readProvider);
// @ts-expect-error Unknown policies must fail for a public consumer.
new SaplingToolkit(keys, { ...contract, outputOrder: 'random' }, readProvider);
