import { describe, expect, it, vi } from 'vitest';
import { BlockResponse } from '@tezos-x/octez.js-rpc';
import { Operation } from '../../src/operations/operations';
import { ForgedBytes } from '../../src/operations/types';
import { defaultConfigConfirmation } from '../../src/context';

// Test that a few blocks older than the head are scanned for confirming the
// inclusion of an operation. This can happen with fast chains.

describe('Operation.confirmation() — inclusion before first observed head (#62)', () => {
  const opHash = 'ood2Y1FLHH9izvYghVcDGGAkvJFo1CgSEjPfWvGsaz3qypCmeUj';

  const block = (level: number, hashes: string[] = []): BlockResponse =>
    ({
      header: { level },
      operations: [hashes.map((hash) => ({ hash })), [], [], []],
    }) as unknown as BlockResponse;

  const makeContext = (
    heads: BlockResponse[] = [block(201)],
    config: Partial<typeof defaultConfigConfirmation> = {},
    includedAt = 200
  ) => {
    // The subscription emits the given heads and nothing further.
    const subscribeBlock = vi.fn(() => ({
      on: (type: string, cb: (data?: unknown) => void) => {
        if (type === 'data') heads.forEach((h, i) => setTimeout(() => cb(h), i));
      },
      off: () => undefined,
      close: () => undefined,
    }));

    const getBlock = vi.fn(async (level: number) =>
      level === includedAt ? block(includedAt, [opHash]) : block(level)
    );

    return {
      config: { ...defaultConfigConfirmation, ...config },
      stream: { subscribeBlock },
      readProvider: { getBlock },
      rpc: { getBlock },
    } as any;
  };

  const levelsFetched = (context: any) =>
    context.readProvider.getBlock.mock.calls.map((c: unknown[]) => c[0]);

  it('finds an operation included below the first observed head', async () => {
    const context = makeContext();
    const op = new Operation(opHash, {} as ForgedBytes, [], context);

    await expect(op.confirmation(1, 5)).resolves.toBe(200);
    expect(op.includedInBlock).toBe(200);
    expect(levelsFetched(context)).toContain(200);
  }, 10000);
});
