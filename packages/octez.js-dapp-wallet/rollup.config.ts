import camelCase from 'lodash.camelcase';
import typescript from 'rollup-plugin-typescript2';
import json from 'rollup-plugin-json';
import nodePolyfills from 'rollup-plugin-polyfill-node';

const pkg = require('./package.json');

const libraryName = 'octez.js-dapp-wallet';

const mainConfig = {
  input: `src/${libraryName}.ts`,
  output: [
    {
      file: pkg.main,
      name: camelCase(libraryName),
      format: 'umd',
      sourcemap: true,
      globals: {
        '@tezos-x/octez.connect-sdk': 'beacon',
        '@tezos-x/octez.js-core': 'taquitoCore',
        '@tezos-x/octez.connect-dapp': 'beaconDapp',
        'typedarray-to-buffer': 'typedarrayToBuffer',
        '@tezos-x/octez.js': 'octezJs',
        '@tezos-x/octez.js-utils': 'octezUtils',
      },
    },
    { file: pkg.module, format: 'es', sourcemap: true },
  ],
  watch: {
    include: 'src/**',
  },
  external: [
    '@tezos-x/octez.connect-sdk',
    '@tezos-x/octez.connect-dapp',
    '@tezos-x/octez.js-core',
    'typedarray-to-buffer',
    '@tezos-x/octez.js',
    '@tezos-x/octez.js-utils',
  ],
  plugins: [
    json(),
    typescript({ tsconfig: './tsconfig.prod.json', useTsconfigDeclarationDir: true }),
    nodePolyfills(),
  ],
};

const beaconTypesConfig = {
  input: 'src/beacon-types.ts',
  output: [
    {
      file: 'dist/beacon-types.umd.js',
      name: 'taquitoBeaconTypes',
      format: 'umd',
      sourcemap: true,
      globals: {
        '@tezos-x/octez.connect-types': 'beaconTypes',
      },
    },
    { file: 'dist/beacon-types.es6.js', format: 'es', sourcemap: true },
  ],
  external: ['@tezos-x/octez.connect-types'],
  plugins: [
    json(),
    typescript({ tsconfig: './tsconfig.prod.json', useTsconfigDeclarationDir: true }),
    nodePolyfills(),
  ],
};

export default [mainConfig, beaconTypesConfig];
