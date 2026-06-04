import camelCase from 'lodash.camelcase';
import typescript from 'rollup-plugin-typescript2';
import json from 'rollup-plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

const pkg = require('./package.json');

const libraryName = 'octez.js-ledger-signer';

export default {
  input: `src/${libraryName}.ts`,
  output: [
    { 
      file: pkg.main, 
      name: camelCase(libraryName), 
      format: 'umd', 
      sourcemap: true, 
      globals: {
        '@tezos-x/octez.js-core': 'core',
        '@tezos-x/octez.js-utils': 'utils'
      } 
    },
    { file: pkg.module, format: 'es', sourcemap: true },
  ],
  // Indicate here external modules you don't wanna include in your bundle (i.e.: 'lodash')
  external: [
    '@tezos-x/octez.js-core',
    '@tezos-x/octez.js-utils'
  ],
  watch: {
    include: 'src/**',
  },
  plugins: [
    // Resolve node_modules
    resolve({
      browser: true,
      preferBuiltins: false,
    }),
    commonjs(),
    // Allow json resolution
    json(),
    // Compile TypeScript files
    typescript({ tsconfig: './tsconfig.prod.json', useTsconfigDeclarationDir: true }),
  ],
};
