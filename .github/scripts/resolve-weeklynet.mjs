// CI pre-flight: resolve the current weeklynet instance.
//
// Weeklynet resets every Wednesday onto a new dated hostname
// (rpc.weeklynet-<date>.teztnets.com, faucet.weeklynet-<date>.teztnets.com) —
// there is no stable alias, so any automated job that targets it must look
// this up at run time instead of hardcoding a date the way shadownet/
// ushuaianet's fixed hostnames allow. teztnets.com/teztnets.json lists every
// live teztnet keyed by name; this picks the (single) key matching
// `weeklynet-<date>` and writes its rpc/faucet URLs to $GITHUB_OUTPUT.
//
//   node .github/scripts/resolve-weeklynet.mjs
import { appendFile } from 'node:fs/promises';

const res = await fetch('https://teztnets.com/teztnets.json');
if (!res.ok) {
  console.error(`teztnets.json fetch failed: ${res.status}`);
  process.exit(1);
}
const networks = await res.json();
const names = Object.keys(networks).filter((k) => /^weeklynet-\d{4}-\d{2}-\d{2}$/.test(k));
if (!names.length) {
  console.error('no weeklynet-YYYY-MM-DD entry found in teztnets.json');
  process.exit(1);
}
// Lexicographic sort of an ISO date suffix is also chronological.
const name = names.sort().pop();
const { rpc_url: rpcUrl, faucet_url: faucetUrl } = networks[name];
if (!rpcUrl || !faucetUrl) {
  console.error(`weeklynet entry ${name} is missing rpc_url/faucet_url`);
  process.exit(1);
}

console.error(`resolved ${name}: rpc=${rpcUrl} faucet=${faucetUrl}`);

const { GITHUB_OUTPUT } = process.env;
if (!GITHUB_OUTPUT) {
  console.error('GITHUB_OUTPUT is not set');
  process.exit(1);
}
await appendFile(GITHUB_OUTPUT, `name=${name}\nrpc_url=${rpcUrl}\nfaucet_url=${faucetUrl}\n`);
