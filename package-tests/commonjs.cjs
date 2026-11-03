/* eslint-disable @typescript-eslint/no-var-requires -- These consumers verify CommonJS require. */
const checkConsumer = require('./runtime.cjs');
checkConsumer(require('@tezos-x/octez.js-core'), require('@tezos-x/octez.js-http-utils')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
