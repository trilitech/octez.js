import camelCase from 'lodash.camelcase';
import typescript from 'rollup-plugin-typescript2';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

const pkg = require('./package.json');

const libraryName = 'octez.js-sapling';

export default {
  input: `src/${libraryName}.ts`,
  output: [
    { 
      file: pkg.main, 
      name: camelCase(libraryName), 
      format: 'umd', 
      sourcemap: true, 
      globals: {
        "bignumber.js": "BigNumber",
        "@tezos-x/octez.js": "octez.js",
        "@tezos-x/octez.js-utils": "utils",
        "@tezos-x/octez.js-core": "core",
        "@taquito/sapling-wasm": "sapling",
        "blakejs": "blake",
        "@stablelib/nacl": "nacl",
        "@stablelib/random": "random",
        "typedarray-to-buffer": "toBuffer",
      }
    },
    { file: pkg.module, format: 'es', sourcemap: true },
  ],
  // Indicate here external modules you don't wanna include in your bundle (i.e.: 'lodash')
  external: [
    'typedarray-to-buffer',
    'blakejs',
    '@tezos-x/octez.js-core',
    '@tezos-x/octez.js-utils',
    'bignumber.js',
    '@taquito/sapling-wasm',
    '@stablelib/nacl',
    'bip39',
    '@stablelib/random',
    '@tezos-x/octez.js'
  ],
  watch: {
    include: 'src/**',
  },
  plugins: [
    // Allow json resolution
    json(),
    // Resolve node_modules (needed for @scure/bip39)
    resolve({ preferBuiltins: false }),
    commonjs(),
    // Compile TypeScript files
    typescript({ tsconfig: './tsconfig.prod.json', useTsconfigDeclarationDir: true }),
  ],
};
