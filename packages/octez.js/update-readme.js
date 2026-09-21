/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * This file has been modified from its original Taquito source
 * (https://github.com/ecadlabs/taquito) as part of the octez.js fork.
 * See NOTICE for details.
 */
const fs = require('fs');

const readmePath = './README.md';

const manifest = require('./assets-manifest.json')
const package = require('./package.json')

const integrityRegex = /integrity="(.*)"/;
const versionRegex = /@tezos-x\/octez\.js@(.+)\/dist/

if (fs.existsSync(readmePath)) {
  let readme = fs.readFileSync(readmePath).toString('utf8');

  readme = readme.replace(integrityRegex, `integrity="${manifest['main.js'].integrity}"`)
  readme = readme.replace(versionRegex, `@tezos-x/octez.js@${package.version}/dist`)

  fs.writeFileSync(readmePath, readme);
}
