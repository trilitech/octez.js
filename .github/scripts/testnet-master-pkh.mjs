#!/usr/bin/env node
// Single source of truth for the CI keygen master pkhs shared by shadownet
// (main.yml) and weeklynet (main.yml + weeklynet-weekly.yml). One process
// per shard, same account on both networks (rotated 2026-09-21,
// ci-09-21-testnet-1..4) — see MASTER_ACCOUNTS.md for why one account per
// shard (never shared) and how to rotate. Corresponding secret keys are the
// GitHub secrets KEYGEN_MASTER_KEY_<shard>, kept out-of-band, not here.
//
// Usage: node .github/scripts/testnet-master-pkh.mjs <shard>  -> prints the pkh
const MASTERS = {
  1: 'tz1TEmNy5iHDKNrabrPKM8himzsjwejn81vX',
  2: 'tz1LDr7y8MK57qvm59WYR4zYGwUrv379XynZ',
  3: 'tz1XyX3rNwPeegAC7JJokhMck7CgPFtMrc39',
  4: 'tz1bYjFszsVgD5N5aFGfkz2CoKnNMpykFKFF',
};

const shard = process.argv[2];
const pkh = MASTERS[shard];

if (!pkh) {
  console.error(`Unknown shard "${shard}". Expected one of: ${Object.keys(MASTERS).join(', ')}`);
  process.exit(1);
}

process.stdout.write(pkh);
