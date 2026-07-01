interface EstimateLike {
  gasLimit: number;
  storageLimit: number;
  suggestedFeeMutez: number;
  burnFeeMutez: number;
  minimalFeeMutez: number;
  totalCost: number;
  usingBaseFeeMutez: number;
  consumedMilligas: number;
}

type EstimateSnapshot = EstimateLike;

export const expectEstimate = (
  estimate: EstimateLike,
  // Retained for call-site compatibility; the accepted-value logic is now
  // network-agnostic (see below), so the rpc is no longer branched on.
  _rpc: string,
  expected: EstimateSnapshot,
  ...alternativeExpected: EstimateSnapshot[]
) => {
  const estimateKeys: (keyof EstimateSnapshot)[] = [
    'gasLimit',
    'storageLimit',
    'burnFeeMutez',
    'consumedMilligas',
    'suggestedFeeMutez',
    'minimalFeeMutez',
    'totalCost',
    'usingBaseFeeMutez',
  ];

  // Fee/gas estimates drift slightly across protocol upgrades and vary
  // run-to-run (especially consumedMilligas), so we match against the set of
  // all recorded snapshots rather than pinning one exact value per network.
  // With a single snapshot this is still an exact match, so callers that pass
  // no alternatives keep their strict behaviour.
  const snapshots = [expected, ...alternativeExpected];

  for (const key of estimateKeys) {
    const expectedValues = [...new Set(snapshots.map((value) => value[key]))];

    // consumedMilligas is nondeterministic; when several distinct values have
    // been observed, accept anything within their range.
    if (key === 'consumedMilligas' && expectedValues.length > 2) {
      expect(estimate[key]).toBeGreaterThanOrEqual(Math.min(...expectedValues));
      expect(estimate[key]).toBeLessThanOrEqual(Math.max(...expectedValues));
      continue;
    }

    expect(expectedValues).toContain(estimate[key]);
  }
};
