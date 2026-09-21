/**
 * This file has been modified from its original Taquito source
 * (https://github.com/ecadlabs/taquito) as part of the octez.js fork.
 * See NOTICE for details.
 */

import { PollingSubscribeProvider, TezosToolkit } from '@tezos-x/octez.js';

async function example() {
  const provider = 'https://tezos-shadownet.octez.io/';
  const tezos = new TezosToolkit(provider)
  tezos.setStreamProvider(tezos.getFactory(PollingSubscribeProvider)({ shouldObservableSubscriptionRetry: true, pollingIntervalMilliseconds: 15000 }));
  try {

    const bakerAttestationFilter = {
      and: [{ source: 'tz1bQMn5xYFbX6geRxqvuAiTywsCtNywawxH' }, { kind: 'attestation' }]
    }

    const bakerDelegation = {
      and: [{ destination: 'tz1bQMn5xYFbX6geRxqvuAiTywsCtNywawxH' }, { kind: 'delegation' }]
    }

    const sub = tezos.stream.subscribeOperation({
      or: [bakerAttestationFilter, bakerDelegation]
    })

    sub.on('data', console.log)
  }
  catch (ex) {
    console.error(ex)
  }
}

example();
