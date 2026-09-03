import { makeSeededRng } from '../test-helpers/seeded-rng';

describe('makeSeededRng', () => {
  it('produces the exact same bytes for the same seed', () => {
    const a = new Uint8Array(37);
    makeSeededRng(1).getRandomValues(a);
    const b = new Uint8Array(37);
    makeSeededRng(1).getRandomValues(b);

    expect(Buffer.from(a)).toEqual(Buffer.from(b));
  });

  it('diverges for a different seed', () => {
    const a = new Uint8Array(37);
    makeSeededRng(1).getRandomValues(a);
    const b = new Uint8Array(37);
    makeSeededRng(2).getRandomValues(b);

    expect(Buffer.from(a)).not.toEqual(Buffer.from(b));
  });

  it('advances on sequential calls against the same instance', () => {
    const rng = makeSeededRng(7);
    const first = new Uint8Array(4);
    rng.getRandomValues(first);
    const second = new Uint8Array(4);
    rng.getRandomValues(second);

    expect(Buffer.from(first)).not.toEqual(Buffer.from(second));
  });

  it('matches the reference mulberry32 output for seed 1', () => {
    // Golden vector, computed independently against a reference mulberry32
    // implementation -- a regression here would silently change every seeded
    // chest/key byte generated from this helper without any test failing
    // elsewhere, since the integration specs that consume it require a live
    // network this suite cannot exercise in a fast, deterministic unit test.
    const out = new Uint8Array(16);
    makeSeededRng(1).getRandomValues(out);

    expect(Buffer.from(out).toString('hex')).toBe('f3ea87a0c949b300ebc40687fd2726fb');
  });

  it('fills every byte for lengths that are not a multiple of 4', () => {
    for (const length of [1, 2, 3, 5, 7, 17]) {
      const out = new Uint8Array(length).fill(0xaa);
      makeSeededRng(1).getRandomValues(out);

      expect(out.some((byte) => byte === 0xaa)).toBe(false);
    }
  });

  it('does not produce degenerate (all-zero) output', () => {
    const out = new Uint8Array(64);
    makeSeededRng(1).getRandomValues(out);

    expect(out.some((byte) => byte !== 0)).toBe(true);
  });
});
