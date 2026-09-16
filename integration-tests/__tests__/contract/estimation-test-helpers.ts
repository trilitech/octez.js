import { DEFAULT_FEE_PARAMS, Protocols } from '@tezos-x/octez.js';
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
 * usingBaseFeeMutez) are NOT matched against recorded snapshot values. They
 * used to be (see git history), after weeklynet was observed flipping its
 * live `minimal_fees` mempool-filter value between two states (100 and 102
 * mutez) multiple times in a single day, shifting every fee-derived field by
 * a uniform +/-2 mutez each time — recording both observed states side by
 * side "fixed" that, until a *third* state (not 100, not 102) showed up and
 * broke it again. That's because `minimal_fees` isn't actually confined to a
 * small set of "known" values — it's an operator-controlled live value on
 * whatever node weeklynet's RPC happens to be backed by at request time, and
 * can be any integer. A growing enumerated allow-list of observed states
 * never converges.
 *
 * Instead, these four fields are checked for *internal consistency* with
 * each other and with `estimate.gasLimit` / `estimate.opSize`, using only
 * the mutez-per-gas-unit and mutez-per-byte rate constants — which, unlike
 * `minimal_fees`, have not been observed to drift (see
 * `packages/octez.js/src/estimate/estimate.ts` and
 * `DEFAULT_FEE_PARAMS`). Concretely: `estimate.minimalFeeMutez` is treated
 * as the one live-dependent input (the network's current `minimal_fees` is
 * inferred back out of it), and the other three fields are checked against
 * the same formula `Estimate` itself uses. This deliberately does NOT
 * verify that `minimal_fees` itself is any particular value — that's an
 * operator-controlled, out-of-repo setting, not something octez.js or the
 * protocol pins — only that the four getters agree with each other for
 * whatever it currently is. The formula itself (given fixed, mocked inputs)
 * is covered by `packages/octez.js/test/estimate/estimate.spec.ts`.
 *
 * `gasLimit`, `storageLimit`, and `burnFeeMutez` remain matched exactly
 * against recorded snapshots — those come from the live gas/storage
 * simulation, not the mempool filter, and are genuine regression signals.
 */
export const expectEstimate = (
  estimate: EstimateLike & { opSize: number | string },
  protocol: Protocols,
  baselines: Partial<Record<Protocols, EstimateSnapshot[]>>
) => {
  const snapshots = baselines[protocol];
  if (!snapshots || snapshots.length === 0) {
    throw new Error(
      `No estimate baseline recorded for protocol ${protocol}. Run against the live network and record the observed values.`
    );
  }

  const networkDerivedKeys: (keyof EstimateSnapshot)[] = [
    'gasLimit',
    'storageLimit',
    'burnFeeMutez',
  ];

  for (const key of networkDerivedKeys) {
    const values = [...new Set(snapshots.map((snapshot) => snapshot[key]))];
    expect(values).toContain(estimate[key]);
  }

  const consumedMilligasValues = snapshots.map((snapshot) => snapshot.consumedMilligas);
  expect(estimate.consumedMilligas).toBeGreaterThanOrEqual(Math.min(...consumedMilligasValues));
  expect(estimate.consumedMilligas).toBeLessThanOrEqual(Math.max(...consumedMilligasValues));

  const operationFeeMutez =
    estimate.gasLimit * DEFAULT_FEE_PARAMS.feePerGasMutez +
    Number(estimate.opSize) * DEFAULT_FEE_PARAMS.feePerByteMutez;

  // The live `minimal_fees`, inferred from this same estimate rather than a separate RPC
  // call, so there's no window for the network to flip between "expected" and "actual".
  const liveMinimalFeeMutez = estimate.minimalFeeMutez - Math.ceil(operationFeeMutez);

  // Loose sanity bound: catches a genuinely broken/garbage value without caring what
  // integer minimal_fees happens to currently be.
  expect(liveMinimalFeeMutez).toBeGreaterThan(0);
  expect(liveMinimalFeeMutez).toBeLessThan(10_000);

  expect(estimate.suggestedFeeMutez).toEqual(
    Math.ceil(operationFeeMutez + liveMinimalFeeMutez * 1.2)
  );
  expect(estimate.totalCost).toEqual(estimate.minimalFeeMutez + estimate.burnFeeMutez);
  expect(estimate.usingBaseFeeMutez).toEqual(
    Math.max(DEFAULT_FEE_PARAMS.minimalFeeMutez, liveMinimalFeeMutez) + Math.ceil(operationFeeMutez)
  );
};
