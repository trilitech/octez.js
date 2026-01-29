// import sourceMaps from 'rollup-plugin-sourcemaps';
import camelCase from 'lodash.camelcase';
import typescript from 'rollup-plugin-typescript2';
import json from 'rollup-plugin-json';
import nodePolyfills from 'rollup-plugin-polyfill-node';

const pkg = require('./package.json');

const libraryName = 'octez.js-wallet-connect';

export default {
  input: `src/${libraryName}.ts`,
  output: [
    {
      file: pkg.main,
      name: camelCase(libraryName),
      format: 'umd',
      sourcemap: true,
      globals: {
        '@walletconnect/sign-client': 'walletconnectSignClient',
        '@walletconnect/modal': 'walletconnectModal',
        '@walletconnect/utils': 'walletconnectUtils',
        '@tezos-x/octez.js': 'octezJs',
      },
    },
    { file: pkg.module, format: 'es', sourcemap: true },
  ],
  external: [
    '@walletconnect/sign-client',
    '@walletconnect/modal',
    '@walletconnect/utils',
    '@tezos-x/octez.js',
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

    // Resolve source maps to the original source
    // sourceMaps(),
  ],
};
