import camelCase from 'lodash.camelcase';
import typescript from 'rollup-plugin-typescript2';
import json from 'rollup-plugin-json';

const pkg = require('./package.json');

const libraryName = 'octez.js-remote-signer';

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
        '@tezos-x/octez.js-http-utils': 'httpUtils',
        '@tezos-x/octez.js-utils': 'utils',
        'typedarray-to-buffer': 'toBuffer',
      } 
    },
    { file: pkg.module, format: 'es', sourcemap: true },
  ],
  // Indicate here external modules you don't wanna include in your bundle (i.e.: 'lodash')
  external: [
    '@tezos-x/octez.js-core',
    '@tezos-x/octez.js-http-utils',
    '@tezos-x/octez.js-utils',
    'typedarray-to-buffer'
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
