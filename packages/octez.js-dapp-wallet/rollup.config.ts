import camelCase from 'lodash.camelcase';
import typescript from 'rollup-plugin-typescript2';
import json from 'rollup-plugin-json';
import nodePolyfills from 'rollup-plugin-polyfill-node';

const pkg = require('./package.json');

const libraryName = 'octez.js-dapp-wallet';

export default {
  input: `src/${libraryName}.ts`,
  output: [
    {
      file: pkg.main,
      name: camelCase(libraryName),
      format: 'umd',
      sourcemap: true,
      globals: {
        '@tezos-x/octez.connect-sdk': 'octezConnectSdk',
        '@tezos-x/octez.connect-dapp': 'octezConnectDapp',
        '@tezos-x/octez.js-core': 'octezCore',
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
    // Allow json resolution
    json(),
    // Compile TypeScript files
    typescript({ tsconfig: './tsconfig.prod.json', useTsconfigDeclarationDir: true }),
    nodePolyfills(),
  ],
};
