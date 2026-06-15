import camelCase from 'lodash.camelcase';
import typescript from 'rollup-plugin-typescript2';
import json from 'rollup-plugin-json';
import nodePolyfills from 'rollup-plugin-polyfill-node';

const pkg = require('./package.json');

const libraryName = 'octez.js-michelson-encoder';

export default {
  input: `src/${libraryName}.ts`,
  output: [
    {
      file: pkg.main,
      name: camelCase(libraryName),
      format: 'umd',
      sourcemap: true,
      globals: {
        'fast-json-stable-stringify': 'stringify',
        '@tezos-x/octez.js-core': 'octezCore',
        'bignumber.js': 'BigNumber',
        '@tezos-x/octez.js-utils': 'taquitoUtils',
      },
    },
    { file: pkg.module, format: 'es', sourcemap: true },
  ],
  // Indicate here external modules you don't wanna include in your bundle (i.e.: 'lodash')
  external: [
    'fast-json-stable-stringify',
    '@tezos-x/octez.js-core',
    '@tezos-x/octez.js-rpc',
    'bignumber.js',
    '@tezos-x/octez.js-utils',
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
