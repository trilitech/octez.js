# Integration tests & the keygen — architecture

The integration tests run **in parallel** against live Tezos testnets. Parallelism
requires that no two tests share a funding key (shared keys serialize on the
account counter and on balance). So instead of a few static funded keys, most
tests acquire a **fresh, funded, single-use key** from a *keygen* service at
setup time. This doc explains the moving parts and how they connect.

## Components

### 1. The test suite (`__tests__/`, vitest)
Specs run under [vitest](https://vitest.dev). In CI the testnet suite is split
into **4 shards** (`--shard=N/4`) that run as parallel jobs, plus a separate
`sapling` job. Each spec calls a `setup(...)` helper from `config.ts` in its
`beforeAll`.

### 2. `config.ts` — network + signer configuration
Defines, per network (shadownet, tallinnnet, …): the RPC URL, known contracts,
and a **signer config**. Two signer modes (`SignerType`):
- **`EPHEMERAL_KEY`** — acquire a fresh key from the keygen (the default for the
  testnet suite; `preferFreshKey: true`).
- **static secret key** (`defaultSecretKey`) — a single configured key, used for
  flextesa/ledger specs and external users who can't run a keygen (tests then run
  sequentially).

### 3. Fresh-key acquisition (`setupSignerWithFreshKey`)
For `preferFreshKey` setups, `config.ts`:
1. `POST {keygenBaseUrl}/v2/{network}` with `Authorization: Bearer <token>` and a
   JSON body `{ min_balance_mutez }`. Response: `{ secret_key, pkh }`.
2. Builds an `InMemorySigner` from `secret_key` and checks the pkh's on-chain
   balance is `>= min_balance_mutez`.
3. **Retries** on a keygen error (HTTP 500/timeout) or `balance_below_*`, up to
   `maxAttempts`, sleeping `retryDelayMs` between attempts (so a just-funded key
   has time to bake).

Only the **v2 fresh-key** endpoint is used; the older `/{network}/ephemeral`
lease endpoints are not exercised by this suite.

### 4. Prefetch buffer (`async-prefetch-buffer.ts`)
A small background buffer pre-acquires a few keys ahead of demand so keygen
latency is hidden between specs. Size is `TAQUITO_FRESH_KEY_PREFETCH`.

### 5. The keygen service ([`trilitech/octez.js-keygen`](https://github.com/trilitech/octez.js-keygen))
A small HTTP service. `POST /v2/:network` (Bearer-authorized) generates a fresh
`tz1` key, **funds it**, and returns `{ secret_key, pkh }`; `GET /health` is an
unauthenticated probe. Funding modes (env):
- **master-account** (`MASTER_KEY` + `RPC_URL`) — funds by transfer from a
  pre-funded account, waiting for confirmation so the returned key is already
  baked. Used in CI.
- **faucet** (`FAUCET_URL`) — funds on-demand via the teztnets faucet PoW
  challenge. Fallback when `MASTER_KEY` is unset.

Each key is funded with `min_balance + FUND_HEADROOM_TEZ` so reveal/op fees don't
drop the usable balance below what the test needs. See the keygen repo's
`docker/MASTER_ACCOUNTS.md` for generating/funding master accounts and
`docker/repro-keygen.sh` to test the funding path locally.

## CI topology (`.github/workflows/main.yml`)

```
integration-tests-change-filter        # decides whether the expensive suite runs
        │
        ▼
keygen-master-topup                     # pre-flight: top up the 4 master accounts
        │                                 from the faucet if below threshold
        ▼
integration-tests-shadownet-shard-{1..4}  # matrix; each job has its OWN keygen
        │                                   service container on localhost:3000
        ▼                                   funded by KEYGEN_MASTER_KEY_<shard>
(integration-tests-shadownet-sapling)     # separate; shares a key-1 concurrency group
```

Each shard job runs `ghcr.io/trilitech/octezjs-keygen:latest` as a **service
container** reachable at `http://localhost:3000` (`TAQUITO_KEYGEN_URL`). The four
shards each use a **distinct** master account (`MASTER_KEY` =
`KEYGEN_MASTER_KEY_<shard>`) so the four keygen processes don't collide on a
shared master's operation counter. A "Keygen container logs" step dumps the
container's stdout/stderr (boot mode + per-request `keygen error:` stacks) for
diagnosis.

## Configuration (env)

| Variable | Purpose | CI value |
|---|---|---|
| `TAQUITO_KEYGEN_URL` | keygen base URL | `http://localhost:3000` (service container) |
| `TAQUITO_KEYGEN_TOKEN` | Bearer token the keygen authorizes | repo secret `KEYGEN_TOKEN` |
| `TAQUITO_FRESH_KEY_PREFETCH` | prefetch buffer size | `2` |
| `TAQUITO_FRESH_KEY_MAX_ATTEMPTS` | acquire retries per setup | `8` (default `5`) |
| `TAQUITO_FRESH_KEY_RETRY_MS` | delay between acquire retries | `12000` (default `0`) |
| `TAQUITO_KEYGEN_REQUEST_TIMEOUT_MS` | per keygen HTTP request timeout | `60000` |
| `TAQUITO_ITEST_DIAGNOSTICS` | emit `[itest:diag]` setup JSON lines | `true` |

Keygen-side env (set on the service container): `KEYGEN_TOKEN`, `ALLOWED_NETWORKS`,
`RPC_URL`, `MASTER_KEY`, `DEFAULT_FUND_TEZ`, `FUND_HEADROOM_TEZ` (or `FAUCET_URL`
for faucet mode).

## Diagnosing failures

The harness emits `[itest:diag]` JSON lines: `setup-start`, `fresh-key-selected`,
`fresh-key-retry`, `setup-complete`, `setup-failed`. A `setup-failed` with
`keygen_error: … (500) {"error":"Failed to generate or fund key"}` means the
keygen couldn't fund the key — the **real** cause is in the keygen container's
logs (the "Keygen container logs" CI step, or `docker logs` locally), e.g. a
funding gas/signature error that the generic 500 hides. `balance_below_*` means
the key wasn't baked yet when checked (raise `retryDelayMs`/`maxAttempts`).
