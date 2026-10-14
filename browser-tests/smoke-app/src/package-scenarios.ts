import type { PackageScenarioId } from '../../scenario-manifest';
import { setSmokeResult } from './smoke-shared';

declare const __RAW_PACKAGE_URLS__: Record<string, string>;

type SmokeOkResult = {
  exports: string[];
  summary: Record<string, unknown>;
};

type SmokeScenario = () => Promise<SmokeOkResult>;

const importPackage = async <T>(packageName: string): Promise<T> => {
  const packageUrl = __RAW_PACKAGE_URLS__[packageName];

  if (!packageUrl) {
    throw new Error(`No smoke-test URL configured for ${packageName}`);
  }

  return (await import(/* @vite-ignore */ packageUrl)) as T;
};

const validContractAddress = 'KT1NGV6nvvedwwjMjCsWY6Vfm6p1q5sMMLDY';

const localForgerOperation = {
  branch: 'BLxGBu48ybnWvZoaVLyXV4XVnhdeDc9V2NcB9wsegQniza6mxvX',
  contents: [
    {
      kind: 'smart_rollup_add_messages',
      source: 'tz1h5DrMhmdrGMpb3qkykU1RmCWoTYAkFJPu',
      fee: '1496',
      counter: '3969',
      gas_limit: '2849',
      storage_limit: '6572',
      message: [
        '0000000062010000000b48656c6c6f20776f726c6401bdb6f61e4f12c952f807ae7d3341af5367887dac000000000764656661756c74010000000b48656c6c6f20776f726c6401bdb6f61e4f12c952f807ae7d3341af5367887dac000000000764656661756c74',
      ],
    },
  ],
} as const;

const localForgerTransaction = {
  branch: localForgerOperation.branch,
  contents: [
    {
      kind: 'transaction',
      source: 'tz1h5DrMhmdrGMpb3qkykU1RmCWoTYAkFJPu',
      fee: '1496',
      counter: '3970',
      gas_limit: '2849',
      storage_limit: '6572',
      amount: '0',
      destination: validContractAddress,
      parameters: {
        entrypoint: 'my_entrypoint',
        value: { prim: 'Pair', args: [{ string: 'octez' }, { int: '42' }] },
      },
    },
  ],
} as const;

// Fixture shared with packages/octez.js-remote-signer/test/octez.js-remote-signer.spec.ts
const remoteSignerPkh = 'tz1iD5nmudc4QtfNW14WWaiP7JEDuUHnbXuv';
const remoteSignerPublicKey = 'edpkuAhkJ81xGyf4PcmRMHLSaQGbDEpkGhNbcjNVnKWKR8kqkgQR3f';
const remoteSignerSignature =
  'sigiGUGvWRkoYuf7ReH3wWAYnpgBFTa2DJ4Nxi7v1Wy5KqS7sZaxNhRiW6ivuoSUdKZnyGTABVk23WnppatuYqHty7uDtWRY';
// Watermarked operation (0x03 prefix) and the raw bytes of the signature above, in hex
const remoteSignerWatermarkedBytes =
  '0365cac93523b8c10346c0107cfea5e12ff3c759459020e532f299e2f41082f7cb6d0000f68c4abfa21dfc0c9efcf588190388cac85d9db60f81d6038b79d8030000000000b902000000b405000764045b0000000a2564656372656d656e74045b0000000a25696e6372656d656e740501035b0502020000008503210317057000010321057100020316072e020000002b032105700002032105710003034203210317057000010321057100020316034b051f020000000405200002020000002b0321057000020321057100030342032103170570000103210571000203160312051f0200000004052000020321053d036d0342051f020000000405200003000000020000';
const remoteSignerSignatureHex =
  '9b00f3b02e3760092415595548e2bd6532b0223d8ff282d31b6f30e35592b6b91a4c37fb0a6a24cc8b5176cc497e204ab722a4711803121ff51dc5a450cfd10b';

// The packages must not rely on a Node.js `Buffer` global in the browser: a polyfill already
// present on the page would hide a missing import, so scenarios assert its absence at every step.
const assertNoGlobalBuffer = (when: string) => {
  if (typeof (globalThis as { Buffer?: unknown }).Buffer !== 'undefined') {
    throw new Error(`Invalid smoke setup: a global Buffer exists ${when}, which would mask missing imports`);
  }
};

const assertEqual = (actual: unknown, expected: unknown, label: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

const scenarios: Record<PackageScenarioId, SmokeScenario> = {
  'core-import': async () => {
    const core = await importPackage<typeof import('@tezos-x/octez.js-core')>('@tezos-x/octez.js-core');

    return {
      exports: ['ValidationResult', 'InvalidAddressError'],
      summary: {
        validationValid: core.ValidationResult.VALID,
        invalidAddressErrorType: typeof core.InvalidAddressError,
      },
    };
  },

  'http-utils-behavior': async () => {
    const { HttpBackend, HttpRequestFailed, HttpResponseError } = await importPackage<
      typeof import('@tezos-x/octez.js-http-utils')
    >('@tezos-x/octez.js-http-utils');
    const backend = new HttpBackend(1234);

    return {
      exports: ['HttpBackend', 'HttpRequestFailed', 'HttpResponseError'],
      summary: {
        backendTimeout: backend.timeout,
        requestFailedName: HttpRequestFailed.name,
        responseErrorName: HttpResponseError.name,
      },
    };
  },

  'utils-behavior': async () => {
    const { bytesToString, stringToBytes, hex2Bytes } = await importPackage<
      typeof import('@tezos-x/octez.js-utils')
    >('@tezos-x/octez.js-utils');
    const encoded = stringToBytes('octez.js');

    return {
      exports: ['bytesToString', 'stringToBytes', 'hex2Bytes'],
      summary: {
        encoded,
        decoded: bytesToString(encoded),
        byteLength: hex2Bytes(encoded).length,
      },
    };
  },

  'rpc-behavior': async () => {
    const { RpcClient, OpKind } = await importPackage<typeof import('@tezos-x/octez.js-rpc')>('@tezos-x/octez.js-rpc');
    const client = new RpcClient('https://example.invalid');

    return {
      exports: ['RpcClient', 'OpKind'],
      summary: {
        rpcUrl: client.getRpcUrl(),
        transactionKind: OpKind.TRANSACTION,
      },
    };
  },

  'michel-codec-behavior': async () => {
    const { Parser, emitMicheline } = await importPackage<typeof import('@tezos-x/octez.js-michel-codec')>(
      '@tezos-x/octez.js-michel-codec'
    );
    const parser = new Parser();
    const parsed = parser.parseMichelineExpression('{ Pair 1 2 }');

    return {
      exports: ['Parser', 'emitMicheline'],
      summary: {
        parsedPrim: Array.isArray(parsed) ? parsed[0]?.prim : null,
        emitted: emitMicheline([{ prim: 'Pair', args: [{ int: '1' }, { int: '2' }] }]),
      },
    };
  },

  'michelson-encoder-behavior': async () => {
    const { MichelsonMap, ParameterSchema } = await importPackage<
      typeof import('@tezos-x/octez.js-michelson-encoder')
    >('@tezos-x/octez.js-michelson-encoder');
    const bytesSchema = new ParameterSchema({ prim: 'bytes' });
    const encoded = bytesSchema.EncodeObject(new Uint8Array([1, 2, 3]));
    const map = MichelsonMap.fromLiteral({ taco: 'shop' });

    return {
      exports: ['MichelsonMap', 'ParameterSchema'],
      summary: {
        encodedBytes: encoded.bytes,
        mapSize: map.size,
        mapValue: map.get('taco'),
      },
    };
  },

  'local-forging-behavior': async () => {
    // The package must not rely on a Node.js `Buffer` global in the browser: fail loudly if the
    // page already provides one, since that would hide a missing `import { Buffer } from 'buffer'`.
    if (typeof (globalThis as { Buffer?: unknown }).Buffer !== 'undefined') {
      throw new Error('Invalid smoke setup: a global Buffer exists, which would mask missing imports');
    }

    const { LocalForger } = await importPackage<typeof import('@tezos-x/octez.js-local-forging')>(
      '@tezos-x/octez.js-local-forging'
    );
    const localForger = new LocalForger();
    const forged = await localForger.forge(localForgerOperation as any);
    // A transaction with a custom entrypoint and a Michelson string exercises the codecs that
    // encode entrypoints, lengths and strings, which are the ones that use Buffer.
    const forgedTransaction = await localForger.forge(localForgerTransaction as any);

    return {
      exports: ['LocalForger'],
      summary: {
        forgedPrefix: forged.slice(0, 20),
        forgedLength: forged.length,
        containsMessage: forged.includes(localForgerOperation.contents[0].message[0]),
        forgedTransactionLength: forgedTransaction.length,
        // hex of the entrypoint name 'my_entrypoint' and of the Michelson string 'octez'
        containsEntrypoint: forgedTransaction.includes('6d795f656e747279706f696e74'),
        containsString: forgedTransaction.includes('6f6374657a'),
      },
    };
  },

  'remote-signer-behavior': async () => {
    assertNoGlobalBuffer('before importing remote-signer');
    const { RemoteSigner } = await importPackage<typeof import('@tezos-x/octez.js-remote-signer')>(
      '@tezos-x/octez.js-remote-signer'
    );
    assertNoGlobalBuffer('after importing remote-signer');

    const requests: { method: string; url: string; data: unknown }[] = [];
    const http = {
      createRequest: async (options: { method: string; url: string }, data?: unknown) => {
        requests.push({ method: options.method, url: options.url, data });
        return options.method === 'POST'
          ? { signature: remoteSignerSignature }
          : { public_key: remoteSignerPublicKey };
      },
    };
    const signer = new RemoteSigner(remoteSignerPkh, 'http://127.0.0.1:6732', {}, http as any);

    // Operation already carrying its watermark: exercises both toBuffer-free conversions
    const signed = await signer.sign(remoteSignerWatermarkedBytes);
    assertNoGlobalBuffer('after signing');
    assertEqual(
      signed,
      {
        bytes: remoteSignerWatermarkedBytes,
        sig: remoteSignerSignature,
        prefixSig: remoteSignerSignature,
        sbytes: remoteSignerWatermarkedBytes + remoteSignerSignatureHex,
      },
      'remote-signer sign() result'
    );
    assertEqual(requests[0].data, remoteSignerWatermarkedBytes, 'remote-signer POST payload');

    // Same operation with the watermark passed separately (mergebuf path)
    const operationBytes = remoteSignerWatermarkedBytes.slice(2);
    const signedWithWatermark = await signer.sign(operationBytes, new Uint8Array([3]));
    assertNoGlobalBuffer('after signing with a watermark');
    assertEqual(
      signedWithWatermark.sbytes,
      operationBytes + remoteSignerSignatureHex,
      'remote-signer sign() with watermark sbytes'
    );
    assertEqual(requests[2].data, remoteSignerWatermarkedBytes, 'remote-signer watermarked POST payload');

    return {
      exports: ['RemoteSigner'],
      summary: {
        requestCount: requests.length,
        sbytesLength: signed.sbytes.length,
      },
    };
  },

  'signer-import': async () => {
    const signer = await importPackage<typeof import('@tezos-x/octez.js-signer')>('@tezos-x/octez.js-signer');

    return {
      exports: ['InMemorySigner', 'VERSION'],
      summary: {
        hasInMemorySigner: typeof signer.InMemorySigner === 'function',
        versionType: typeof signer.VERSION.version,
      },
    };
  },

  'octez.js-behavior': async () => {
    const { MichelsonMap, OpKind, TezosToolkit } = await importPackage<
      typeof import('@tezos-x/octez.js')
    >('@tezos-x/octez.js');
    const tezos = new TezosToolkit('https://example.invalid');
    const map = new MichelsonMap();

    return {
      exports: ['TezosToolkit', 'MichelsonMap', 'OpKind'],
      summary: {
        toolkitType: typeof tezos,
        mapSize: map.size,
        transactionKind: OpKind.TRANSACTION,
      },
    };
  },

  'tzip16-behavior': async () => {
    const { DEFAULT_HANDLERS, Tzip16Module } = await importPackage<typeof import('@tezos-x/octez.js-tzip16')>(
      '@tezos-x/octez.js-tzip16'
    );
    const module = new Tzip16Module();

    return {
      exports: ['DEFAULT_HANDLERS', 'Tzip16Module'],
      summary: {
        defaultHandlers: DEFAULT_HANDLERS.size,
        moduleType: typeof module,
      },
    };
  },

  'tzip12-behavior': async () => {
    const { Tzip12Module } = await importPackage<typeof import('@tezos-x/octez.js-tzip12')>('@tezos-x/octez.js-tzip12');
    const module = new Tzip12Module();

    return {
      exports: ['Tzip12Module'],
      summary: {
        moduleType: typeof module,
      },
    };
  },

  'contracts-library-behavior': async () => {
    const { ContractsLibrary } = await importPackage<typeof import('@tezos-x/octez.js-contracts-library')>(
      '@tezos-x/octez.js-contracts-library'
    );
    const library = new ContractsLibrary();

    library.addContract({
      [validContractAddress]: {
        script: { code: [] } as any,
        entrypoints: {} as any,
      },
    });

    return {
      exports: ['ContractsLibrary'],
      summary: {
        storedContract: library.getContract(validContractAddress) !== undefined,
      },
    };
  },

  'timelock-behavior': async () => {
    const { Chest } = await importPackage<typeof import('@tezos-x/octez.js-timelock')>('@tezos-x/octez.js-timelock');
    const payload = new TextEncoder().encode('browser-smoke');
    const time = 16;
    const { chest, key } = Chest.newChestAndKey(payload, time);
    const reopened = chest.open(key, time);

    return {
      exports: ['Chest'],
      summary: {
        reopenedMatches: reopened !== null && bytesEqual(reopened, payload),
        encodedLength: chest.encode().length,
      },
    };
  },

  'dapp-wallet-import': async () => {
    const beaconWallet = await importPackage<typeof import('@tezos-x/octez.js-dapp-wallet')>(
      '@tezos-x/octez.js-dapp-wallet'
    );

    return {
      exports: ['BeaconWallet', 'BeaconWalletNotInitialized'],
      summary: {
        beaconWalletType: typeof beaconWallet.BeaconWallet,
        errorType: typeof beaconWallet.BeaconWalletNotInitialized,
      },
    };
  },

  'wallet-connect-import': async () => {
    const walletConnect = await importPackage<typeof import('@tezos-x/octez.js-wallet-connect')>(
      '@tezos-x/octez.js-wallet-connect'
    );

    return {
      exports: ['WalletConnect', 'NetworkType'],
      summary: {
        walletConnectType: typeof walletConnect.WalletConnect,
        shadownet: walletConnect.NetworkType.SHADOWNET,
      },
    };
  },

  'ledger-signer-behavior': async () => {
    const { DerivationType, LedgerSigner } = await importPackage<typeof import('@tezos-x/octez.js-ledger-signer')>(
      '@tezos-x/octez.js-ledger-signer'
    );
    const mockTransport = {
      send: async () =>
        hexToBytes(
          '21026760ff228c2c16cbca18bb782a106e51c43a131776f5dfad30ecb5d5e43eccbd9000',
        ),
      decorateAppAPIMethods: () => undefined,
      setScrambleKey: () => undefined,
    };
    const signer = new LedgerSigner(mockTransport as any, "44'/1729'/0'/0'", false, DerivationType.ED25519);
    const publicKey = await signer.publicKey();
    const publicKeyHash = await signer.publicKeyHash();

    return {
      exports: ['LedgerSigner', 'DerivationType', 'HDPathTemplate'],
      summary: {
        publicKey,
        publicKeyHash,
      },
    };
  },

  'sapling-import': async () => {
    const sapling = await importPackage<typeof import('@tezos-x/octez.js-sapling')>('@tezos-x/octez.js-sapling');

    return {
      exports: ['SaplingToolkit', 'SaplingTransactionViewer', 'initSapling', 'preloadSaplingParams'],
      summary: {
        hasSaplingToolkit: typeof sapling.SaplingToolkit === 'function',
        hasTransactionViewer: typeof sapling.SaplingTransactionViewer === 'function',
        hasInitSapling: typeof sapling.initSapling === 'function',
        hasPreloadSaplingParams: typeof sapling.preloadSaplingParams === 'function',
      },
    };
  },

  'sapling-preload': async () => {
    const sapling = await importPackage<typeof import('@tezos-x/octez.js-sapling')>('@tezos-x/octez.js-sapling');
    const startedAt = performance.now();

    await sapling.initSapling({
      params: {
        source: 'octez.js',
      },
    });
    await sapling.preloadSaplingParams();

    return {
      exports: ['initSapling', 'preloadSaplingParams'],
      summary: {
        preloadSucceeded: true,
        elapsedMs: Math.round(performance.now() - startedAt),
      },
    };
  },
};

const bytesEqual = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const hexToBytes = (hex: string) => {
  const normalized = hex.length % 2 === 0 ? hex : `0${hex}`;
  const bytes = new Uint8Array(normalized.length / 2);

  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }

  return bytes;
};

const getScenarioId = (): PackageScenarioId => {
  const scenario = new URLSearchParams(window.location.search).get('scenario');

  if (!scenario || !(scenario in scenarios)) {
    throw new Error(`Unknown browser smoke scenario "${scenario ?? ''}"`);
  }

  return scenario as PackageScenarioId;
};

export const runScenario = async () => {
  const scenarioId = getScenarioId();
  const result = await scenarios[scenarioId]();

  setSmokeResult({
    status: 'ok',
    exports: result.exports,
    summary: {
      scenarioId,
      ...result.summary,
    },
  });
};
