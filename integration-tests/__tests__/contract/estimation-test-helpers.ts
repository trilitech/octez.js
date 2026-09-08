import { Protocols } from '@tezos-x/octez.js';
import { ProtocolsResponse } from '@tezos-x/octez.js-rpc';

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

/**
 * Resolve the protocol actually running at head into the {@link Protocols} enum.
 *
 * Gas baselines are keyed by the *live* protocol rather than a hardcoded network
 * config, because shadownet shadows whichever proposal is currently under test:
 * its protocol is a moving target, and the declared config value goes stale the
 * moment the net migrates. Reading it at runtime keeps the estimate assertions
 * honest and makes a brand-new protocol fail loudly (see {@link expectEstimate})
 * instead of silently comparing against the wrong baseline.
 */
export const resolveProtocol = (protocols: ProtocolsResponse): Protocols => {
  const match = Object.values(Protocols).find((p) => p === protocols.protocol);
  if (!match) {
    throw new Error(
      `Unknown protocol ${protocols.protocol}. Add it to the Protocols enum and record gas baselines for it.`
    );
  }
  return match;
};

/**
 * Assert an estimate against the baseline recorded for the given protocol.
 *
 * `baselines` maps a protocol to one or more observed snapshots. Every field is
 * matched exactly (any listed value is accepted), except `consumedMilligas`,
 * which is checked against the [min, max] band of the listed snapshots. Milligas
 * jitters run-to-run (and across protocol point-releases that keep the same hash),
 * so list every observed value and the band widens to cover it.
 *
 * Keep every snapshot observed on a lane under that lane's *live* protocol key.
 * Do NOT split a recorded list across protocol keys on the assumption that the
 * spread is protocol-driven: it is mostly run-to-run and node-version jitter.
 * Shadownet on PsUshuai has been observed emitting every value in these lists
 * (gasLimit 1868 and 1869, consumedMilligas 3457129 through 3457645), so a
 * speculative Tallinn/Ushuaia split turns all 16 call sites red. Add a new
 * protocol key only once you have actually recorded values under it.
 *
 * A single-snapshot entry for a new protocol key is not automatically
 * suspect just because it's shorter than an older key's list — the length
 * reflects how much jitter was actually observed, not how many times it was
 * run. An initial 3-run sample of ProtoALpha's "internal" call sites
 * (weeklynet) came back byte-identical, but a later CI run did observe the
 * same milligas spread PsUshuai has, so those sites now carry PsUshuai's
 * full 3-snapshot set too — don't assume a short list stays short.
 *
 * Fee-derived fields (suggestedFeeMutez, minimalFeeMutez, totalCost,
 * usingBaseFeeMutez) are matched exactly, not banded, and weeklynet's
 * ProtoALpha build can change them wholesale: an underlying protocol
 * rebuild mid-week has shifted every fee site by the same delta at once
 * (e.g. +2 mutez across all 36 call sites in tz1-4). That is a real
 * baseline change, not jitter — when it happens, re-run live and replace
 * the recorded values rather than widening these into a tolerance band.
 */
export const expectEstimate = (
  estimate: EstimateLike,
  protocol: Protocols,
  baselines: Partial<Record<Protocols, EstimateSnapshot[]>>
) => {
  const snapshots = baselines[protocol];
  if (!snapshots || snapshots.length === 0) {
    throw new Error(
      `No estimate baseline recorded for protocol ${protocol}. Run against the live network and record the observed values.`
    );
  }

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

  for (const key of estimateKeys) {
    const values = [...new Set(snapshots.map((snapshot) => snapshot[key]))];

    if (key === 'consumedMilligas') {
      expect(estimate[key]).toBeGreaterThanOrEqual(Math.min(...values));
      expect(estimate[key]).toBeLessThanOrEqual(Math.max(...values));
      continue;
    }

    expect(values).toContain(estimate[key]);
  }
};
