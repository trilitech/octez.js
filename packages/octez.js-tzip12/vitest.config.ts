import { defineConfig, mergeConfig } from 'vitest/config';
import { definePackageVitestConfig } from '../../vitest.package';

export default mergeConfig(
  definePackageVitestConfig('@tezos-x/octez.js-tzip12'),
  defineConfig({
    test: {
      coverage: {
        exclude: ['src/taquito-tzip12.ts'],
      },
    },
  })
);
