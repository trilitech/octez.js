import camelCase from 'lodash.camelcase';
import typescript from 'rollup-plugin-typescript2';
import json from 'rollup-plugin-json';

const pkg = require('./package.json');

const libraryName = 'octez.js-tzip12';

export default {
  input: `src/${libraryName}.ts`,
  output: [
    { 
      file: pkg.main, 
      name: camelCase(libraryName), 
      format: 'umd', 
      sourcemap: true, 
      globals: { 
        "@tezos-x/octez.js-core": "octezCore",
        "@tezos-x/octez.js-michelson-encoder": "michelsonEncoder",
        "@tezos-x/octez.js-tzip16": "tzip16",
        "@tezos-x/octez.js-utils": "utils"
      } 
    },
    { file: pkg.module, format: 'es', sourcemap: true },
  ],
  // Indicate here external modules you don't wanna include in your bundle (i.e.: 'lodash')
  external: [
  '@tezos-x/octez.js-core',
  '@tezos-x/octez.js-michelson-encoder',
  '@tezos-x/octez.js-tzip16',
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
  ],
};
