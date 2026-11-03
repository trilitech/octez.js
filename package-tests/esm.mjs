import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as core from '@tezos-x/octez.js-core';
import * as http from '@tezos-x/octez.js-http-utils';
import { NetworkError } from '@tezos-x/octez.js-core';
import { HttpResponseError } from '@tezos-x/octez.js-http-utils';
import checkConsumer from './runtime.cjs';

const require = createRequire(import.meta.url);
const commonCore = require('@tezos-x/octez.js-core');
const commonHttp = require('@tezos-x/octez.js-http-utils');
assert.equal(NetworkError, commonCore.NetworkError);
assert.equal(HttpResponseError, commonHttp.HttpResponseError);
// Native ESM currently exposes the CommonJS module as its default export.
assert.equal(core.default, commonCore);
assert.equal(http.default, commonHttp);
await checkConsumer(core, http);
