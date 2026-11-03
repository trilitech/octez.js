import { InvalidAddressError, NetworkError, ValidationResult } from '@tezos-x/octez.js-core';
import { HttpResponseError } from '@tezos-x/octez.js-http-utils';
import { BeaconWallet } from '@tezos-x/octez.js-dapp-wallet';
import { NetworkType } from '@tezos-x/octez.js-dapp-wallet/types';

const invalid = new InvalidAddressError('invalid');
const error = new HttpResponseError('missing', 404, 'Not Found', '{}', '/missing');
if (invalid.message !== 'Invalid address "invalid"' || ValidationResult.INVALID_CHECKSUM !== 1) {
  throw new Error('Core browser behavior changed');
}
if (!(error instanceof NetworkError) || error.status !== 404 || error.body !== '{}') {
  throw new Error('HTTP browser error behavior changed');
}
if (typeof BeaconWallet !== 'function' || NetworkType.MAINNET !== 'mainnet') {
  throw new Error('Beacon browser exports changed');
}
globalThis.consumerPassed = true;
