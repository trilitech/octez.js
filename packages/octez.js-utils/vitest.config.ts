import { defineConfig, mergeConfig } from 'vitest/config';
import { definePackageVitestConfig } from '../../vitest.package';

export default mergeConfig(
  definePackageVitestConfig('@tezos-x/octez.js-utils'),
  defineConfig({
    test: {
      typecheck: {
        enabled: true,
        include: ['test/**/*.test-d.ts'],
        tsconfig: './tsconfig.test.json',
      },
    },
  })
);
