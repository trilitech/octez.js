#!/usr/bin/env node
/**
 * This file has been modified from its original Taquito source
 * (https://github.com/ecadlabs/taquito) as part of the octez.js fork.
 * See NOTICE for details.
 */

// Copies the root LICENSE and NOTICE files into the current package
// directory. Intended to run as each publishable package's "prepack"
// script, since npm only bundles LICENSE/NOTICE when they live inside the
// package directory being packed, not at the workspace root.

const { copyFileSync } = require('fs');
const { join } = require('path');

const root = join(__dirname, '..');
const files = ['LICENSE', 'NOTICE'];

for (const file of files) {
  copyFileSync(join(root, file), join(process.cwd(), file));
}
