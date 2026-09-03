// CI: read a freshly generated known-contracts-<network>.ts and emit its
// address fields as $GITHUB_OUTPUT key=value pairs.
//
// Used after `npm run originate-known-contracts` re-originates weeklynet's
// known contracts fresh on every automated run (weeklynet resets weekly, so
// the committed addresses can't be trusted) — see weeklynet-originate in
// main.yml, which passes these on to the shard matrix as job outputs.
//
//   node .github/scripts/read-known-contracts.mjs <network>
import { readFile, appendFile } from 'node:fs/promises';

const [, , network] = process.argv;
if (!network) {
  console.error('usage: read-known-contracts.mjs <network>');
  process.exit(1);
}

const path = new URL(`../../integration-tests/known-contracts-${network}.ts`, import.meta.url);
const text = await readFile(path, 'utf8');

// Maps the field name written by originate-known-contracts.ts to the
// GITHUB_OUTPUT name main.yml reads it back under.
const FIELDS = {
  contract: 'contract',
  bigMapContract: 'big_map_contract',
  tzip12BigMapOffChainContract: 'tzip1216_contract',
  saplingContract: 'sapling_contract',
  onChainViewContractAddress: 'view_contract',
  ticketContract: 'ticket_contract',
};

const { GITHUB_OUTPUT } = process.env;
if (!GITHUB_OUTPUT) {
  console.error('GITHUB_OUTPUT is not set');
  process.exit(1);
}

const lines = [];
for (const [field, outputName] of Object.entries(FIELDS)) {
  const match = text.match(new RegExp(`${field}:\\s*"([^"]*)"`));
  const address = match ? match[1] : '';
  if (!address) console.error(`::warning::${field} was not originated (empty address)`);
  lines.push(`${outputName}=${address}`);
}
await appendFile(GITHUB_OUTPUT, lines.join('\n') + '\n');
console.error(`read ${Object.keys(FIELDS).length} addresses from ${path}`);
