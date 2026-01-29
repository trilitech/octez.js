import camelCase from 'lodash.camelcase';
import typescript from 'rollup-plugin-typescript2';
import json from 'rollup-plugin-json';
import nodePolyfills from 'rollup-plugin-polyfill-node';

const pkg = require('./package.json');

const libraryName = 'octezJs';

export default {
  input: 'src/taquito.ts',
  output: [
    {
      file: pkg.main,
      name: camelCase(libraryName),
      format: 'umd',
      sourcemap: true,
      globals: {
        '@tezos-x/octez.js-rpc': 'rpc',
        '@tezos-x/octez.js-http-utils': 'httpUtils',
        '@tezos-x/octez.js-core': 'core',
        'rxjs': 'rxjs',
        'rxjs/operators': 'operators',
        '@tezos-x/octez.js-michelson-encoder': 'michelsonEncoder',
        '@tezos-x/octez.js-utils': 'utils',
        'bignumber.js': 'BigNumber',
        '@tezos-x/octez.js-michel-codec': 'michelCodec',
        '@tezos-x/octez.js-local-forging': 'localForging',
        '@tezos-x/octez.js-signer': 'octezSigner'
      }
    },
    { file: pkg.module, format: 'es', sourcemap: true },
  ],
  // Indicate here external modules you don't wanna include in your bundle (i.e.: 'lodash')
  external: [
    '@tezos-x/octez.js-http-utils',
    '@tezos-x/octez.js-core',
    '@tezos-x/octez.js-rpc',
    '@tezos-x/octez.js-utils',
    '@tezos-x/octez.js-michelson-encoder',
    '@tezos-x/octez.js-michel-codec',
    '@tezos-x/octez.js-local-forging',
    '@tezos-x/octez.js-signer',
    'rxjs',
    'rxjs/operators',
    'bignumber.js'
  ],
  watch: {
    include: 'src/**',
  },
  plugins: [
    // Allow json resolution
    json(),
    // Compile TypeScript files
    typescript({ tsconfig: './tsconfig.prod.json', useTsconfigDeclarationDir: true }),
    nodePolyfills(),
  ],
};
