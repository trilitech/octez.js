// Unit tests for the pure logic in weeklynet-failure-notify.mjs: config
// defaults, shard-summary parsing, body/comment rendering, tracker-issue
// selection, and the create/reopen/update + comment decision matrices.
// Deliberately network- and gh-CLI-free — run with
// `node --test .github/scripts/weeklynet-failure-notify.test.mjs`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  isDryRun,
  loadConfig,
  readShardSummaries,
  renderIssueBody,
  renderWeeklynetVersionLine,
  renderComment,
  selectTrackerIssue,
  decideAction,
  shouldComment,
} from './weeklynet-failure-notify.mjs';

test('isDryRun: falsy values', () => {
  for (const v of [undefined, null, '', '0', 'false', 'FALSE', 'no', 'No']) {
    assert.equal(isDryRun(v), false, `expected ${JSON.stringify(v)} to be falsy`);
  }
});

test('isDryRun: truthy values', () => {
  for (const v of ['1', 'true', 'yes', 'anything']) {
    assert.equal(isDryRun(v), true, `expected ${JSON.stringify(v)} to be truthy`);
  }
});

test('loadConfig: defaults', () => {
  const config = loadConfig({});
  assert.equal(config.runResult, '');
  assert.equal(config.runUrl, '');
  assert.equal(config.commitSha, '');
  assert.equal(config.commitUrl, '');
  assert.equal(config.weeklynetActivatedOn, '');
  assert.equal(config.weeklynetDockerBuild, '');
  assert.equal(config.weeklynetGitRef, '');
  assert.equal(config.issueLabel, 'weeklynet-regression');
  assert.equal(config.issueTitle, 'Weeklynet Weekly Integration Failure');
  assert.equal(config.metricsDir, 'ci-metrics');
  assert.equal(config.dryRun, false);
});

test('loadConfig: overrides from env', () => {
  const config = loadConfig({
    RUN_RESULT: 'failure',
    RUN_URL: 'https://example.com/run/1',
    COMMIT_SHA: 'deadbeef',
    COMMIT_URL: 'https://example.com/commit/deadbeef',
    WEEKLYNET_ACTIVATED_ON: '2026-09-09',
    WEEKLYNET_DOCKER_BUILD: 'tezos/tezos:master_85f37c4e_20260908133615',
    WEEKLYNET_GIT_REF: '85f37c4e',
    ISSUE_LABEL: 'custom-label',
    ISSUE_TITLE: 'Custom Title',
    METRICS_DIR: 'other-dir',
    DRY_RUN: '1',
  });
  assert.equal(config.runResult, 'failure');
  assert.equal(config.runUrl, 'https://example.com/run/1');
  assert.equal(config.commitSha, 'deadbeef');
  assert.equal(config.commitUrl, 'https://example.com/commit/deadbeef');
  assert.equal(config.weeklynetActivatedOn, '2026-09-09');
  assert.equal(config.weeklynetDockerBuild, 'tezos/tezos:master_85f37c4e_20260908133615');
  assert.equal(config.weeklynetGitRef, '85f37c4e');
  assert.equal(config.issueLabel, 'custom-label');
  assert.equal(config.issueTitle, 'Custom Title');
  assert.equal(config.metricsDir, 'other-dir');
  assert.equal(config.dryRun, true);
});

test('readShardSummaries: returns [] for a missing directory', () => {
  assert.deepEqual(readShardSummaries(join(tmpdir(), 'does-not-exist-weeklynet-notify')), []);
});

test('readShardSummaries: reads, filters, and sorts matching shard files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weeklynet-notify-shards-'));
  try {
    writeFileSync(
      join(dir, 'itest-timing-weeklynet-weekly-2.json'),
      JSON.stringify({ status: 'fail', exit_code: 1, elapsed_seconds: 42 }),
    );
    writeFileSync(
      join(dir, 'itest-timing-weeklynet-weekly-1.json'),
      JSON.stringify({ status: 'pass', exit_code: 0, elapsed_seconds: 10 }),
    );
    // Non-matching files must be ignored.
    writeFileSync(join(dir, 'unrelated.json'), JSON.stringify({ foo: 'bar' }));
    writeFileSync(join(dir, 'itest-timing-weeklynet-weekly-3.json'), 'not valid json');

    const summaries = readShardSummaries(dir);
    assert.deepEqual(summaries, [
      { shard: 1, status: 'pass', exitCode: 0, elapsedSeconds: 10 },
      { shard: 2, status: 'fail', exitCode: 1, elapsedSeconds: 42 },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readShardSummaries: missing fields fall back to defaults, not dropped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weeklynet-notify-shards-'));
  try {
    writeFileSync(join(dir, 'itest-timing-weeklynet-weekly-1.json'), JSON.stringify({}));
    const summaries = readShardSummaries(dir);
    assert.deepEqual(summaries, [{ shard: 1, status: 'unknown', exitCode: null, elapsedSeconds: null }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readShardSummaries: sorts numerically, not lexicographically (shard 10 vs 2)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weeklynet-notify-shards-'));
  try {
    writeFileSync(
      join(dir, 'itest-timing-weeklynet-weekly-10.json'),
      JSON.stringify({ status: 'pass', exit_code: 0, elapsed_seconds: 1 }),
    );
    writeFileSync(
      join(dir, 'itest-timing-weeklynet-weekly-2.json'),
      JSON.stringify({ status: 'pass', exit_code: 0, elapsed_seconds: 1 }),
    );
    const summaries = readShardSummaries(dir);
    assert.deepEqual(
      summaries.map((s) => s.shard),
      [2, 10],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('renderIssueBody: failure includes header, run URL, and shard table', () => {
  const body = renderIssueBody({
    runResult: 'failure',
    commitSha: 'deadbeef',
    commitUrl: 'https://example.com/commit/deadbeef',
    runUrl: 'https://example.com/run/42',
    shardSummaries: [{ shard: 1, status: 'fail', exitCode: 1, elapsedSeconds: 99 }],
    generatedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.match(body, /\*\*Last commit tested:\*\* `deadbeef` \(https:\/\/example\.com\/commit\/deadbeef\)/);
  assert.match(body, /\*\*Last checked:\*\* 2026-01-01T00:00:00\.000Z/);
  assert.match(body, /\*\*Status:\*\* ❌ FAILING/);
  assert.match(body, /https:\/\/example\.com\/run\/42/);
  assert.match(body, /\| 1 \| fail \| 1 \| 99 \|/);
});

test('renderIssueBody: success includes header and status but no shard table', () => {
  const body = renderIssueBody({
    runResult: 'success',
    commitSha: 'cafef00d',
    commitUrl: 'https://example.com/commit/cafef00d',
    runUrl: 'https://example.com/run/43',
    shardSummaries: [],
    generatedAt: '2026-01-02T00:00:00.000Z',
  });
  assert.match(body, /\*\*Last commit tested:\*\* `cafef00d`/);
  assert.match(body, /\*\*Status:\*\* ✅ PASSING/);
  assert.match(body, /https:\/\/example\.com\/run\/43/);
  assert.doesNotMatch(body, /\| Shard \|/);
});

test('renderIssueBody: always states it is never closed automatically', () => {
  for (const runResult of ['success', 'failure']) {
    const body = renderIssueBody({
      runResult,
      commitSha: 'sha',
      commitUrl: 'url',
      runUrl: 'https://example.com/run/1',
      shardSummaries: [],
      generatedAt: '2026-01-01T00:00:00.000Z',
    });
    assert.match(body, /never closed automatically/i);
  }
});

test('renderWeeklynetVersionLine: all fields present', () => {
  const line = renderWeeklynetVersionLine({
    activatedOn: '2026-09-09',
    dockerBuild: 'tezos/tezos:master_85f37c4e_20260908133615',
    gitRef: '85f37c4e',
  });
  assert.match(line, /\*\*Weeklynet version:\*\*/);
  assert.match(line, /activated 2026-09-09/);
  assert.match(line, /docker `tezos\/tezos:master_85f37c4e_20260908133615`/);
  assert.match(line, /octez commit \[`85f37c4e`\]\(https:\/\/gitlab\.com\/tezos\/tezos\/-\/commit\/85f37c4e\)/);
});

test('renderWeeklynetVersionLine: returns empty string when everything is missing', () => {
  assert.equal(renderWeeklynetVersionLine({ activatedOn: '', dockerBuild: '', gitRef: '' }), '');
  assert.equal(renderWeeklynetVersionLine({}), '');
});

test('renderWeeklynetVersionLine: renders only the fields that are present', () => {
  assert.equal(
    renderWeeklynetVersionLine({ activatedOn: '2026-09-09', dockerBuild: '', gitRef: '' }),
    '**Weeklynet version:** activated 2026-09-09',
  );
});

test('renderIssueBody: includes the weeklynet version line when version info is provided', () => {
  const body = renderIssueBody({
    runResult: 'failure',
    commitSha: 'sha',
    commitUrl: 'url',
    runUrl: 'https://example.com/run/42',
    shardSummaries: [],
    generatedAt: '2026-01-01T00:00:00.000Z',
    weeklynetActivatedOn: '2026-09-09',
    weeklynetDockerBuild: 'tezos/tezos:master_85f37c4e_20260908133615',
    weeklynetGitRef: '85f37c4e',
  });
  assert.match(body, /\*\*Weeklynet version:\*\* activated 2026-09-09/);
});

test('renderIssueBody: omits the weeklynet version line when version info is absent', () => {
  const body = renderIssueBody({
    runResult: 'failure',
    commitSha: 'sha',
    commitUrl: 'url',
    runUrl: 'https://example.com/run/42',
    shardSummaries: [],
    generatedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.doesNotMatch(body, /Weeklynet version/);
});

test('renderIssueBody: exitCode/elapsedSeconds of 0 render as 0, not the "—" fallback', () => {
  const body = renderIssueBody({
    runResult: 'failure',
    commitSha: 'sha',
    commitUrl: 'url',
    runUrl: 'https://example.com/run/42',
    shardSummaries: [{ shard: 1, status: 'pass', exitCode: 0, elapsedSeconds: 0 }],
    generatedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.match(body, /\| 1 \| pass \| 0 \| 0 \|/);
});

test('renderComment: failure and success wording differ, both include run URL', () => {
  const failing = renderComment({
    runResult: 'failure',
    runUrl: 'https://example.com/run/1',
    generatedAt: '2026-01-01T00:00:00.000Z',
  });
  const passing = renderComment({
    runResult: 'success',
    runUrl: 'https://example.com/run/2',
    generatedAt: '2026-01-02T00:00:00.000Z',
  });
  assert.match(failing, /Failing/);
  assert.match(failing, /https:\/\/example\.com\/run\/1/);
  assert.match(passing, /Passing/);
  assert.match(passing, /https:\/\/example\.com\/run\/2/);
});

test('selectTrackerIssue: exact title match only', () => {
  const results = [
    { number: 1, title: 'Weeklynet Weekly Integration Failure (old)', state: 'CLOSED' },
    { number: 2, title: 'Weeklynet Weekly Integration Failure', state: 'OPEN' },
  ];
  const found = selectTrackerIssue(results, 'Weeklynet Weekly Integration Failure');
  assert.equal(found.number, 2);
});

test('selectTrackerIssue: returns null when nothing matches', () => {
  assert.equal(selectTrackerIssue([], 'Weeklynet Weekly Integration Failure'), null);
  assert.equal(
    selectTrackerIssue([{ number: 1, title: 'Something else', state: 'OPEN' }], 'Weeklynet Weekly Integration Failure'),
    null,
  );
});

test('selectTrackerIssue: prefers an OPEN exact match over a newer CLOSED one', () => {
  // gh issue list --state all returns newest-created first — simulate a
  // stale closed duplicate ranked ahead of the genuinely open tracker.
  const results = [
    { number: 5, title: 'Weeklynet Weekly Integration Failure', state: 'CLOSED' },
    { number: 2, title: 'Weeklynet Weekly Integration Failure', state: 'OPEN' },
  ];
  const found = selectTrackerIssue(results, 'Weeklynet Weekly Integration Failure');
  assert.equal(found.number, 2);
});

test('selectTrackerIssue: falls back to the first exact match when none are OPEN', () => {
  const results = [{ number: 5, title: 'Weeklynet Weekly Integration Failure', state: 'CLOSED' }];
  const found = selectTrackerIssue(results, 'Weeklynet Weekly Integration Failure');
  assert.equal(found.number, 5);
});

test('decideAction: cancelled/skipped are ignored regardless of existing issue', () => {
  for (const runResult of ['cancelled', 'skipped']) {
    assert.equal(decideAction({ runResult, existing: null }), 'ignore');
    assert.equal(decideAction({ runResult, existing: { number: 1, state: 'OPEN' } }), 'ignore');
    assert.equal(decideAction({ runResult, existing: { number: 1, state: 'CLOSED' } }), 'ignore');
  }
});

test('decideAction: no tracker issue always creates one, pass or fail', () => {
  assert.equal(decideAction({ runResult: 'success', existing: null }), 'create');
  assert.equal(decideAction({ runResult: 'failure', existing: null }), 'create');
});

test('decideAction: a closed tracker issue is always reopened, pass or fail', () => {
  assert.equal(
    decideAction({ runResult: 'success', existing: { number: 1, state: 'CLOSED' } }),
    'reopen-and-update',
  );
  assert.equal(
    decideAction({ runResult: 'failure', existing: { number: 1, state: 'CLOSED' } }),
    'reopen-and-update',
  );
});

test('decideAction: an open tracker issue is just updated, pass or fail', () => {
  assert.equal(decideAction({ runResult: 'success', existing: { number: 1, state: 'OPEN' } }), 'update');
  assert.equal(decideAction({ runResult: 'failure', existing: { number: 1, state: 'OPEN' } }), 'update');
});

test('shouldComment: reopen always comments, regardless of pass/fail', () => {
  assert.equal(shouldComment({ action: 'reopen-and-update', runResult: 'success' }), true);
  assert.equal(shouldComment({ action: 'reopen-and-update', runResult: 'failure' }), true);
});

test('shouldComment: create never comments (the body is the first record)', () => {
  assert.equal(shouldComment({ action: 'create', runResult: 'success' }), false);
  assert.equal(shouldComment({ action: 'create', runResult: 'failure' }), false);
});

test('shouldComment: update comments only while still failing', () => {
  assert.equal(shouldComment({ action: 'update', runResult: 'failure' }), true);
  assert.equal(shouldComment({ action: 'update', runResult: 'success' }), false);
});
