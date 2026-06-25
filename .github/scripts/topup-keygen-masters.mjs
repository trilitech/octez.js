// CI pre-flight: keep the per-shard keygen master accounts funded.
//
// Funds by ADDRESS via the teztnets faucet PoW challenge, so it needs only the
// public pkhs (PKHS), never the secret keys. For each master below MIN_BALANCE_TEZ
// it tops up to TARGET_TEZ; healthy accounts are skipped (fast no-op). The faucet
// grants the amount over many small single-use PoW challenges and intermittently
// 500s, so the whole challenge cycle is restarted on any error and we wait for the
// grant to bake before re-funding.
//
//   PKHS=tz1...,tz1...,tz1...,tz1... MIN_BALANCE_TEZ=200 TARGET_TEZ=600 \
//     RPC_URL=https://rpc.shadownet.teztnets.com \
//     FAUCET_URL=https://faucet.shadownet.teztnets.com \
//     node .github/scripts/topup-keygen-masters.mjs
//
// Best-effort: a master that can't be topped up logs a warning but does not fail
// the job (tests still attempt; that shard may fall short). Exit code is always 0
// unless misconfigured, so a transient faucet outage never blocks the test run.
import { createHash } from 'node:crypto';

const {
  PKHS = '',
  MIN_BALANCE_TEZ = '200',
  TARGET_TEZ = '600',
  FAUCET_URL = 'https://faucet.shadownet.teztnets.com',
  RPC_URL = 'https://rpc.shadownet.teztnets.com',
  MAX_CYCLE_RETRIES = '12',
} = process.env;

const pkhs = PKHS.split(',').map((s) => s.trim()).filter(Boolean);
const minMutez = Math.floor(parseFloat(MIN_BALANCE_TEZ) * 1_000_000);
const targetTez = parseFloat(TARGET_TEZ);
const targetMutez = Math.floor(targetTez * 1_000_000);
const maxCycleRetries = parseInt(MAX_CYCLE_RETRIES, 10);

if (!pkhs.length) {
  console.error('PKHS is required (comma-separated master addresses)');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function solveChallenge(challenge, difficulty) {
  const prefix = '0'.repeat(difficulty);
  let nonce = 0;
  for (;;) {
    const hashHex = createHash('sha256').update(`${challenge}:${nonce}`).digest('hex');
    if (hashHex.startsWith(prefix)) return { nonce, solution: hashHex };
    nonce++;
  }
}

async function post(path, body) {
  const res = await fetch(`${FAUCET_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} ${res.status} ${await res.text()}`);
  return res.json();
}

async function getBalanceMutez(pkh) {
  const res = await fetch(`${RPC_URL}/chains/main/blocks/head/context/contracts/${pkh}/balance`);
  if (!res.ok) {
    if (res.status === 404) return 0;
    throw new Error(`RPC balance ${res.status}`);
  }
  return parseInt(await res.json(), 10);
}

async function fundCycle(pkh, amount) {
  let data = await post('/challenge', { address: pkh, amount });
  while (data && data.challenge) {
    const { nonce, solution } = solveChallenge(data.challenge, data.difficulty);
    data = await post('/verify', { address: pkh, amount, nonce, solution });
  }
  if (!data || !data.txHash) throw new Error('no txHash');
  return data.txHash;
}

async function waitForBalance(pkh, target, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let bal = await getBalanceMutez(pkh);
  while (bal < target && Date.now() < deadline) {
    await sleep(5000);
    bal = await getBalanceMutez(pkh);
  }
  return bal;
}

async function topUp(pkh) {
  for (let attempt = 1; attempt <= maxCycleRetries; attempt++) {
    const bal = await getBalanceMutez(pkh);
    if (bal >= targetMutez) return bal;
    try {
      const txHash = await fundCycle(pkh, targetTez);
      const baked = await waitForBalance(pkh, targetMutez, 90000);
      console.log(`    ${pkh}: cycle ok (${txHash}); balance now ${baked / 1e6} tez`);
      if (baked >= targetMutez) return baked;
    } catch (err) {
      const backoff = Math.min(2000 * attempt, 10000);
      console.log(`    ${pkh}: cycle error (${attempt}/${maxCycleRetries}): ${err.message}; retry in ${backoff}ms`);
      await sleep(backoff);
    }
  }
  return getBalanceMutez(pkh);
}

async function main() {
  console.log(
    `Top-up check: ${pkhs.length} master(s), min=${MIN_BALANCE_TEZ} tez, target=${targetTez} tez. ` +
      `RPC=${RPC_URL} faucet=${FAUCET_URL}`,
  );
  for (const pkh of pkhs) {
    let bal;
    try {
      bal = await getBalanceMutez(pkh);
    } catch (err) {
      console.warn(`! ${pkh}: balance check failed (${err.message}); skipping`);
      continue;
    }
    if (bal >= minMutez) {
      console.log(`= ${pkh}: ${bal / 1e6} tez >= ${MIN_BALANCE_TEZ} — ok`);
      continue;
    }
    console.log(`+ ${pkh}: ${bal / 1e6} tez < ${MIN_BALANCE_TEZ} — topping up to ${targetTez} tez`);
    try {
      const after = await topUp(pkh);
      if (after >= targetMutez) console.log(`+ ${pkh}: topped up to ${after / 1e6} tez`);
      else console.warn(`! ${pkh}: still short after retries (${after / 1e6} tez) — tests may fall short`);
    } catch (err) {
      console.warn(`! ${pkh}: top-up failed (${err.message}) — tests may fall short`);
    }
  }
  console.log('Top-up check complete.');
}

main().catch((err) => {
  // Never block the test run on a faucet/RPC outage.
  console.warn('top-up encountered an error (non-fatal):', err.message || err);
});
