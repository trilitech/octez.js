// Weekly weeklynet notifier: on every terminal run (pass or fail) of
// weeklynet-weekly.yml, finds-or-creates a single evergreen, labelled
// tracking issue — mirroring taquito-sync.mjs's evergreen tracker, not a
// per-test diff against a prior run's results. The issue always carries a
// header with the last commit tested and the last checked date (same shape
// as taquito-sync's "Last reviewed" / "Last checked" lines), so it stays a
// live status board even across a run of consecutive passes.
//
// The issue is never closed by this script — only a human does, once
// they've confirmed it's actually resolved (see this repo's
// .harness/rules/human-validation.md: agents propose, humans decide). Its
// lifecycle mirrors taquito-sync's tracker exactly: create if missing,
// reopen if found closed (regardless of pass/fail — a human closed it, but
// the tracker's job is to keep reflecting reality), leave open if already
// open. A comment is posted only on a reopen or on an already-open issue
// that is *still* failing (so a lingering problem keeps nagging weekly);
// a fresh creation or a silent pass-while-open update needs no separate
// comment — the body itself is the current, always-fresh record.
//
// Mirrors the find-or-create/update conventions already established by
// .github/scripts/taquito-sync.mjs (exact-title + label search via `gh issue
// list`, body written to a tmp file, DRY_RUN gating) rather than inventing a
// new one.
//
// Config (env vars):
//   RUN_RESULT   required. Combined 'success' | 'failure' | 'cancelled' |
//                'skipped' across weeklynet-resolve-rpc, weeklynet-originate,
//                and the shard matrix — a failure in RPC resolution or
//                contract origination must notify too, not just a failing
//                shard, since those are weeklynet's most failure-prone steps
//                (see the caller's RUN_RESULT expression in
//                weeklynet-weekly.yml).
//   RUN_URL      required. Link to the GitHub Actions run.
//   COMMIT_SHA   required. The commit this run tested (github.sha).
//   COMMIT_URL   required. Link to that commit.
//   WEEKLYNET_ACTIVATED_ON, WEEKLYNET_DOCKER_BUILD, WEEKLYNET_GIT_REF
//                optional. Weeklynet's own version info
//                (teztnets.com/weeklynet-about), resolved by
//                resolve-weeklynet.mjs — which octez build the *network* is
//                running, not the octez.js commit under test. Any/all may
//                be blank; the version line is simply omitted.
//   ISSUE_LABEL  default 'weeklynet-regression'
//   ISSUE_TITLE  default 'Weeklynet Weekly Integration Failure'
//   METRICS_DIR  default 'ci-metrics'. Directory to scan for this run's
//                itest-timing-weeklynet-weekly-<shard>.json files (best
//                effort — a missing/empty directory just omits the
//                per-shard table from the issue body).
//   DRY_RUN      default unset. When truthy, performs the read-only `gh
//                issue list` lookup (same as a live run — matches
//                taquito-sync.mjs's convention of never gating reads) but
//                skips every mutating `gh issue` call, printing what would
//                have happened instead.
//
//   GH_TOKEN / GITHUB_TOKEN must be set for `gh` to authenticate.
//
// Usage:
//   RUN_RESULT=failure RUN_URL=https://... COMMIT_SHA=... COMMIT_URL=... \
//     node .github/scripts/weeklynet-failure-notify.mjs
//
// Pure logic (config, shard-summary parsing, body/comment rendering, issue
// selection, the decision matrix) is exported and unit-tested without
// network/gh access — see weeklynet-failure-notify.test.mjs.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const FALSY_DRY_RUN_VALUES = new Set(['', '0', 'false', 'no']);

export function isDryRun(value) {
  if (value === undefined || value === null) return false;
  return !FALSY_DRY_RUN_VALUES.has(String(value).trim().toLowerCase());
}

export function loadConfig(env = process.env) {
  return {
    runResult: env.RUN_RESULT || '',
    runUrl: env.RUN_URL || '',
    commitSha: env.COMMIT_SHA || '',
    commitUrl: env.COMMIT_URL || '',
    // Weeklynet's own version info (teztnets.com/weeklynet-about), resolved
    // by .github/scripts/resolve-weeklynet.mjs — distinct from commitSha/
    // commitUrl above, which are the octez.js commit under test, not the
    // octez build weeklynet itself is running. All optional: absent rather
    // than failing the notification if resolve-weeklynet.mjs's fetch didn't
    // return them (or failed outright).
    weeklynetActivatedOn: env.WEEKLYNET_ACTIVATED_ON || '',
    weeklynetDockerBuild: env.WEEKLYNET_DOCKER_BUILD || '',
    weeklynetGitRef: env.WEEKLYNET_GIT_REF || '',
    issueLabel: env.ISSUE_LABEL || 'weeklynet-regression',
    issueTitle: env.ISSUE_TITLE || 'Weeklynet Weekly Integration Failure',
    metricsDir: env.METRICS_DIR || 'ci-metrics',
    dryRun: isDryRun(env.DRY_RUN),
  };
}

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

const SHARD_FILE_RE = /^itest-timing-weeklynet-weekly-(\d+)\.json$/;

// Best-effort: a shard summary file that is missing, unreadable, or not the
// expected shape is skipped rather than failing the whole notification.
export function readShardSummaries(dir, { readdir = readdirSync, readFile = readFileSync } = {}) {
  let entries;
  try {
    entries = readdir(dir);
  } catch {
    return [];
  }
  const summaries = [];
  for (const entry of entries.sort()) {
    const match = SHARD_FILE_RE.exec(entry);
    if (!match) continue;
    try {
      const parsed = JSON.parse(readFile(join(dir, entry), 'utf8'));
      summaries.push({
        shard: Number(match[1]),
        status: parsed.status ?? 'unknown',
        exitCode: parsed.exit_code ?? null,
        elapsedSeconds: parsed.elapsed_seconds ?? null,
      });
    } catch {
      // Skip malformed/unreadable shard file — it's diagnostic data, not
      // load-bearing for the notification itself.
    }
  }
  return summaries.sort((a, b) => a.shard - b.shard);
}

// Weeklynet's own version info (teztnets.com/weeklynet-about), distinct from
// the octez.js commitSha/commitUrl in the header below — this describes
// which octez build the *network itself* is running, so a reader can tell
// "did weeklynet reset onto a new build" from "did octez.js regress"
// without visiting teztnets.com. Any/all fields may be absent (best-effort,
// see resolve-weeklynet.mjs) — returns '' when there's nothing to show, so
// the caller can omit the line entirely rather than render an empty one.
export function renderWeeklynetVersionLine({ activatedOn, dockerBuild, gitRef }) {
  const parts = [];
  if (activatedOn) parts.push(`activated ${activatedOn}`);
  if (dockerBuild) parts.push(`docker \`${dockerBuild}\``);
  if (gitRef) {
    parts.push(`octez commit [\`${gitRef}\`](https://gitlab.com/tezos/tezos/-/commit/${gitRef})`);
  }
  return parts.length ? `**Weeklynet version:** ${parts.join(' · ')}` : '';
}

// Always-current header, same shape as taquito-sync.mjs's renderIssueBody:
// "Last reviewed"/"Last checked" there, "Last commit tested"/"Last checked"
// here — plus a Status line, since (unlike taquito-sync) this tracker's
// entire point is reflecting current pass/fail state, not a content diff.
export function renderIssueBody({
  runResult,
  commitSha,
  commitUrl,
  runUrl,
  shardSummaries,
  generatedAt,
  weeklynetActivatedOn,
  weeklynetDockerBuild,
  weeklynetGitRef,
}) {
  const lines = [
    '<!-- Auto-generated by .github/workflows/weeklynet-weekly.yml (runs weekly). -->',
    '<!-- Manual edits will be overwritten on the next run. -->',
    '',
    `**Last commit tested:** \`${commitSha}\` (${commitUrl})`,
    `**Last checked:** ${generatedAt}`,
    `**Status:** ${runResult === 'failure' ? '❌ FAILING' : '✅ PASSING'}`,
  ];
  const weeklynetVersionLine = renderWeeklynetVersionLine({
    activatedOn: weeklynetActivatedOn,
    dockerBuild: weeklynetDockerBuild,
    gitRef: weeklynetGitRef,
  });
  if (weeklynetVersionLine) lines.push(weeklynetVersionLine);
  lines.push('');

  if (runResult === 'failure') {
    lines.push(`**Run:** ${runUrl}`, '');
    if (shardSummaries.length) {
      lines.push('| Shard | Status | Exit code | Elapsed (s) |', '|---|---|---|---|');
      for (const s of shardSummaries) {
        lines.push(`| ${s.shard} | ${s.status} | ${s.exitCode ?? '—'} | ${s.elapsedSeconds ?? '—'} |`);
      }
      lines.push('');
    }
    lines.push(
      'Open the run above and download the `itest-timing-weeklynet-weekly-*` artifacts / job logs ' +
        'for the failing shard(s) to see what broke.',
    );
  } else {
    lines.push(`The weekly scheduled integration run passed: ${runUrl}`);
  }

  lines.push(
    '',
    'This issue is never closed automatically: it is created if missing and reopened whenever a ' +
      'run finds it closed, regardless of pass/fail. Close it yourself once you consider things ' +
      'resolved.',
  );

  return lines.join('\n');
}

export function renderComment({ runResult, runUrl, generatedAt }) {
  return runResult === 'failure'
    ? `❌ Failing as of ${generatedAt}: ${runUrl}`
    : `✅ Passing as of ${generatedAt}: ${runUrl}`;
}

// Prefers an OPEN exact match over a CLOSED one: `gh issue list` returns
// newest-created first, and with `--state all` two exact-title+label issues
// (e.g. a stale closed duplicate) would otherwise pick whichever is newer
// regardless of state.
export function selectTrackerIssue(results, issueTitle) {
  const exact = (results || []).filter((r) => r.title === issueTitle);
  if (!exact.length) return null;
  return exact.find((r) => r.state === 'OPEN') ?? exact[0];
}

// Pure lifecycle decision, independent of any gh lookup and of pass/fail —
// the tracker issue always ends up open after a terminal run:
//   'ignore'            — RUN_RESULT is neither success nor failure
//                          (cancelled/skipped) — status is unknown, touch
//                          nothing
//   'create'            — no tracker issue exists yet
//   'reopen-and-update' — the tracker issue exists but is closed (a human
//                          closed it) — reopen unconditionally, regardless
//                          of pass/fail, then refresh its header/content
//   'update'            — the tracker issue exists and is already open —
//                          just refresh its header/content
export function decideAction({ runResult, existing }) {
  if (runResult !== 'success' && runResult !== 'failure') {
    return 'ignore';
  }
  if (!existing) return 'create';
  return existing.state === 'CLOSED' ? 'reopen-and-update' : 'update';
}

// A separate axis from decideAction: whether this action also warrants a
// comment (a ping in the thread), vs. a silent body-only refresh.
//   - 'create' needs no comment — the body itself is the first record.
//   - 'reopen-and-update' always comments — reopening is inherently
//     noteworthy (state changed since a human last touched it).
//   - 'update' comments only while still failing — an ongoing problem is
//     worth a weekly nudge; a routine pass-while-open refresh stays silent,
//     mirroring taquito-sync's "no new commits → heartbeat only, no
//     comment" convention.
export function shouldComment({ action, runResult }) {
  if (action === 'reopen-and-update') return true;
  if (action === 'update') return runResult === 'failure';
  return false;
}

// ---------------------------------------------------------------------------
// I/O (gh CLI)
// ---------------------------------------------------------------------------

function findTrackerIssue({ issueTitle, issueLabel }) {
  const out = execFileSync(
    'gh',
    [
      'issue',
      'list',
      '--search',
      `"${issueTitle}" in:title`,
      '--label',
      issueLabel,
      '--state',
      'all',
      '--json',
      'number,title,state',
      '--limit',
      '10',
    ],
    { encoding: 'utf8' },
  );
  const results = JSON.parse(out || '[]');
  return selectTrackerIssue(results, issueTitle);
}

function withBodyFile(body, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'weeklynet-notify-body-'));
  const file = join(dir, 'body.md');
  try {
    writeFileSync(file, body, 'utf8');
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function createIssue({ issueTitle, issueLabel }, body) {
  return withBodyFile(body, (file) =>
    execFileSync(
      'gh',
      ['issue', 'create', '--title', issueTitle, '--label', issueLabel, '--body-file', file],
      { encoding: 'utf8' },
    ).trim(),
  );
}

function reopenIssue(number) {
  execFileSync('gh', ['issue', 'reopen', String(number)], { encoding: 'utf8' });
}

function updateIssue(number, body) {
  withBodyFile(body, (file) =>
    execFileSync('gh', ['issue', 'edit', String(number), '--body-file', file], { encoding: 'utf8' }),
  );
}

function commentOnIssue(number, text) {
  execFileSync('gh', ['issue', 'comment', String(number), '--body', text], { encoding: 'utf8' });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function main(env = process.env) {
  const config = loadConfig(env);
  const generatedAt = new Date().toISOString();

  if (!config.runResult) {
    console.error('RUN_RESULT is required (success | failure | cancelled | skipped)');
    process.exit(1);
  }
  if (!config.runUrl) {
    console.error('RUN_URL is required');
    process.exit(1);
  }

  if (config.runResult !== 'success' && config.runResult !== 'failure') {
    console.log(`RUN_RESULT=${config.runResult} — not success or failure, nothing to notify.`);
    return;
  }

  // The read-only lookup runs even under DRY_RUN (matches taquito-sync.mjs's
  // convention of never gating reads) so a dry run can report the real
  // action (create vs. update vs. reopen) instead of guessing.
  const existing = findTrackerIssue({ issueTitle: config.issueTitle, issueLabel: config.issueLabel });
  const action = decideAction({ runResult: config.runResult, existing });
  const shardSummaries = readShardSummaries(config.metricsDir);
  const body = renderIssueBody({
    runResult: config.runResult,
    commitSha: config.commitSha,
    commitUrl: config.commitUrl,
    runUrl: config.runUrl,
    shardSummaries,
    generatedAt,
    weeklynetActivatedOn: config.weeklynetActivatedOn,
    weeklynetDockerBuild: config.weeklynetDockerBuild,
    weeklynetGitRef: config.weeklynetGitRef,
  });
  const comment = shouldComment({ action, runResult: config.runResult })
    ? renderComment({ runResult: config.runResult, runUrl: config.runUrl, generatedAt })
    : null;

  if (config.dryRun) {
    const actionLabel =
      action === 'create' ? 'CREATE' : action === 'reopen-and-update' ? 'REOPEN + UPDATE' : 'UPDATE';
    console.log(`[DRY_RUN] Would ${actionLabel} the tracker issue.`);
    console.log('--- body ---');
    console.log(body);
    if (comment) {
      console.log('--- comment ---');
      console.log(comment);
    }
    return;
  }

  switch (action) {
    case 'create': {
      const created = createIssue({ issueTitle: config.issueTitle, issueLabel: config.issueLabel }, body);
      console.log(`Created tracker issue: ${created}`);
      return;
    }
    case 'reopen-and-update':
    case 'update': {
      if (action === 'reopen-and-update') reopenIssue(existing.number);
      updateIssue(existing.number, body);
      if (comment) commentOnIssue(existing.number, comment);
      console.log(
        `${action === 'reopen-and-update' ? 'Reopened and updated' : 'Updated'} tracker issue ` +
          `#${existing.number}${comment ? ' and commented' : ''}.`,
      );
      return;
    }
    default:
      return;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
