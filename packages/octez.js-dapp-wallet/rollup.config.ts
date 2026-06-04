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
        '@ecadlabs/beacon-sdk': 'beacon',
        '@tezos-x/octez.js-core': 'taquitoCore',
        '@ecadlabs/beacon-dapp': 'beaconDapp',
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
    '@ecadlabs/beacon-sdk',
    '@ecadlabs/beacon-dapp',
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
        '@ecadlabs/beacon-types': 'beaconTypes',
      },
    },
    { file: 'dist/beacon-types.es6.js', format: 'es', sourcemap: true },
  ],
  external: ['@ecadlabs/beacon-types'],
  plugins: [
    json(),
    typescript({ tsconfig: './tsconfig.prod.json', useTsconfigDeclarationDir: true }),
    nodePolyfills(),
  ],
};

export default [mainConfig, beaconTypesConfig];
