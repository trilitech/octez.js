import { defineConfig, mergeConfig } from 'vitest/config';
import { definePackageVitestConfig } from '../../vitest.package';

export default mergeConfig(
  definePackageVitestConfig('@tezos-x/octez.js-sapling'),
  defineConfig({
    test: {
      testTimeout: 30000,
    },
  })
);
