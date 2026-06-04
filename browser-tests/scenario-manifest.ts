export type PackageScenarioId =
  | 'core-import'
  | 'http-utils-behavior'
  | 'utils-behavior'
  | 'rpc-behavior'
  | 'michel-codec-behavior'
  | 'michelson-encoder-behavior'
  | 'local-forging-behavior'
  | 'signer-import'
  | 'taquito-behavior'
  | 'tzip16-behavior'
  | 'tzip12-behavior'
  | 'contracts-library-behavior'
  | 'timelock-behavior'
  | 'beacon-wallet-import'
  | 'wallet-connect-import'
  | 'ledger-signer-behavior'
  | 'sapling-import'
  | 'sapling-preload';

export type PackageScenario = {
  id: PackageScenarioId;
  packageName: string;
  description: string;
};

export const packageScenarios: readonly PackageScenario[] = [
  {
    id: 'core-import',
    packageName: '@tezos-x/octez.js-core',
    description: 'imports the core package in a browser',
  },
  {
    id: 'http-utils-behavior',
    packageName: '@tezos-x/octez.js-http-utils',
    description: 'imports http-utils and instantiates HttpBackend',
  },
  {
    id: 'utils-behavior',
    packageName: '@tezos-x/octez.js-utils',
    description: 'imports utils and round-trips UTF-8 bytes',
  },
  {
    id: 'rpc-behavior',
    packageName: '@tezos-x/octez.js-rpc',
    description: 'imports rpc and instantiates RpcClient',
  },
  {
    id: 'michel-codec-behavior',
    packageName: '@tezos-x/octez.js-michel-codec',
    description: 'imports michel-codec and parses Micheline',
  },
  {
    id: 'michelson-encoder-behavior',
    packageName: '@tezos-x/octez.js-michelson-encoder',
    description: 'imports michelson-encoder and encodes a bytes-like token value',
  },
  {
    id: 'local-forging-behavior',
    packageName: '@tezos-x/octez.js-local-forging',
    description: 'imports local-forging and forges a manager operation',
  },
  {
    id: 'signer-import',
    packageName: '@tezos-x/octez.js-signer',
    description: 'imports the signer package in a browser',
  },
  {
    id: 'taquito-behavior',
    packageName: '@tezos-x/octez.js',
    description: 'imports taquito and instantiates TezosToolkit',
  },
  {
    id: 'tzip16-behavior',
    packageName: '@tezos-x/octez.js-tzip16',
    description: 'imports tzip16 and instantiates Tzip16Module',
  },
  {
    id: 'tzip12-behavior',
    packageName: '@tezos-x/octez.js-tzip12',
    description: 'imports tzip12 and instantiates Tzip12Module',
  },
  {
    id: 'contracts-library-behavior',
    packageName: '@tezos-x/octez.js-contracts-library',
    description: 'imports contracts-library and stores contract metadata',
  },
  {
    id: 'timelock-behavior',
    packageName: '@tezos-x/octez.js-timelock',
    description: 'imports timelock and opens a generated chest',
  },
  {
    id: 'beacon-wallet-import',
    packageName: '@tezos-x/octez.js-dapp-wallet',
    description: 'imports beacon-wallet in a browser',
  },
  {
    id: 'wallet-connect-import',
    packageName: '@tezos-x/octez.js-wallet-connect',
    description: 'imports wallet-connect in a browser',
  },
  {
    id: 'ledger-signer-behavior',
    packageName: '@tezos-x/octez.js-ledger-signer',
    description: 'imports ledger-signer and exercises LedgerSigner byte helpers',
  },
  {
    id: 'sapling-import',
    packageName: '@tezos-x/octez.js-sapling',
    description: 'imports sapling in a browser',
  },
  {
    id: 'sapling-preload',
    packageName: '@tezos-x/octez.js-sapling',
    description: 'imports sapling and preloads hosted proving parameters in a browser',
  },
] as const;
