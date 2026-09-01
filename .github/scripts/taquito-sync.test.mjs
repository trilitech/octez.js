// Unit tests for the pure logic in taquito-sync.mjs: classification,
// rendering, and checkpoint-marker parsing. Deliberately network- and
// gh-CLI-free — run with `node --test .github/scripts/taquito-sync.test.mjs`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  BUCKET,
  isDryRun,
  loadConfig,
  repoWebUrl,
  commitUrl,
  parseConventionalCommit,
  isWebsiteCommit,
  isNoiseCommit,
  derivePackage,
  classifyCommit,
  groupActionableCommits,
  summarizeCounts,
  parseGitLogOutput,
  GIT_LOG_FIELD_SEP,
  GIT_LOG_RECORD_SEP,
  GIT_LOG_FORMAT,
  CHECKPOINT_MARKER_RE,
  renderCheckpointMarker,
  parseCheckpointSha,
  renderIssueBody,
  upsertLastCheckedLine,
  selectTrackerIssue,
  resolveTrackerState,
} from './taquito-sync.mjs';

function makeCommit(overrides = {}) {
  return {
    sha: 'a'.repeat(40),
    shortSha: 'aaaaaaa',
    author: 'Jane Dev',
    date: '2026-08-20T10:00:00+00:00',
    subject: 'chore: something',
    files: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isDryRun / loadConfig
// ---------------------------------------------------------------------------

test('isDryRun: falsy for unset/empty/0/false/no', () => {
  for (const v of [undefined, null, '', '0', 'false', 'FALSE', 'no', 'No']) {
    assert.equal(isDryRun(v), false, `expected falsy for ${JSON.stringify(v)}`);
  }
});

test('isDryRun: truthy for 1/true/yes/anything-else', () => {
  for (const v of ['1', 'true', 'yes', 'dry-run']) {
    assert.equal(isDryRun(v), true, `expected truthy for ${JSON.stringify(v)}`);
  }
});

test('loadConfig: applies defaults when env vars are unset', () => {
  const config = loadConfig({});
  assert.equal(config.repoUrl, 'https://github.com/ecadlabs/taquito.git');
  assert.equal(config.branch, 'main');
  assert.equal(config.issueLabel, 'taquito-sync');
  assert.equal(config.issueTitle, 'Taquito Sync Tracker');
  assert.equal(config.dryRun, false);
});

test('loadConfig: honors env var overrides', () => {
  const config = loadConfig({
    TAQUITO_REPO_URL: 'https://example.com/fork/taquito.git',
    TAQUITO_BRANCH: 'develop',
    ISSUE_LABEL: 'custom-label',
    ISSUE_TITLE: 'Custom Title',
    DRY_RUN: '1',
  });
  assert.equal(config.repoUrl, 'https://example.com/fork/taquito.git');
  assert.equal(config.branch, 'develop');
  assert.equal(config.issueLabel, 'custom-label');
  assert.equal(config.issueTitle, 'Custom Title');
  assert.equal(config.dryRun, true);
});

test('repoWebUrl / commitUrl strip .git and build commit links', () => {
  assert.equal(repoWebUrl('https://github.com/ecadlabs/taquito.git'), 'https://github.com/ecadlabs/taquito');
  assert.equal(repoWebUrl('https://github.com/ecadlabs/taquito'), 'https://github.com/ecadlabs/taquito');
  assert.equal(
    commitUrl('https://github.com/ecadlabs/taquito.git', 'deadbeef'),
    'https://github.com/ecadlabs/taquito/commit/deadbeef',
  );
});

// ---------------------------------------------------------------------------
// parseConventionalCommit
// ---------------------------------------------------------------------------

test('parseConventionalCommit: parses type, scope, breaking, description', () => {
  assert.deepEqual(parseConventionalCommit('fix(rpc): handle 404 responses'), {
    type: 'fix',
    scope: 'rpc',
    breaking: false,
    description: 'handle 404 responses',
  });
  assert.deepEqual(parseConventionalCommit('feat!: breaking change'), {
    type: 'feat',
    scope: null,
    breaking: true,
    description: 'breaking change',
  });
  assert.deepEqual(parseConventionalCommit('chore(deps): bump lodash'), {
    type: 'chore',
    scope: 'deps',
    breaking: false,
    description: 'bump lodash',
  });
});

test('parseConventionalCommit: returns null for unparseable subjects', () => {
  assert.equal(parseConventionalCommit('Merge pull request #123'), null);
  assert.equal(parseConventionalCommit('bump version to 25.0.0'), null);
  assert.equal(parseConventionalCommit(''), null);
  assert.equal(parseConventionalCommit(undefined), null);
});

// ---------------------------------------------------------------------------
// Classification buckets
// ---------------------------------------------------------------------------

test('classifyCommit: website bucket wins whenever any file starts with website/', () => {
  const commit = makeCommit({
    subject: 'fix: typo',
    files: ['website/docs/guide.md', 'packages/taquito-rpc/src/index.ts'],
  });
  assert.equal(isWebsiteCommit(commit), true);
  assert.deepEqual(classifyCommit(commit), { bucket: BUCKET.WEBSITE });
});

test('classifyCommit: noise bucket via file-subset heuristic', () => {
  const commit = makeCommit({
    subject: 'chore: bump deps',
    files: ['package.json', 'package-lock.json'],
  });
  assert.equal(isNoiseCommit(commit), true);
  assert.deepEqual(classifyCommit(commit), { bucket: BUCKET.NOISE });
});

test('classifyCommit: noise bucket via chore(release) subject regardless of files', () => {
  const commit = makeCommit({
    subject: 'chore(release): publish 25.1.0',
    files: ['packages/taquito-rpc/package.json', 'packages/taquito-rpc/CHANGELOG.md', 'lerna.json'],
  });
  assert.equal(isNoiseCommit(commit), true);
  assert.equal(classifyCommit(commit).bucket, BUCKET.NOISE);
});

test('classifyCommit: noise bucket via "chore: publish" subject', () => {
  const commit = makeCommit({ subject: 'chore: publish packages', files: ['random/file.ts'] });
  assert.equal(isNoiseCommit(commit), true);
});

test('classifyCommit: a file set that is NOT a subset of the noise allow-list is not noise', () => {
  const commit = makeCommit({
    subject: 'chore: tidy up',
    files: ['package.json', 'packages/taquito-rpc/src/index.ts'],
  });
  assert.equal(isNoiseCommit(commit), false);
});

test('classifyCommit: protocol bucket takes priority over fix-shaped subjects', () => {
  const commit = makeCommit({
    subject: 'fix(protocol): handle new protocol constants shape',
    files: ['packages/taquito/src/constants.ts'],
  });
  const result = classifyCommit(commit);
  assert.equal(result.bucket, BUCKET.ACTIONABLE);
  assert.equal(result.type, 'Protocol');
});

test('classifyCommit: protocol detected via bare subject match too', () => {
  const commit = makeCommit({ subject: 'update for Oxford protocol', files: ['packages/taquito/src/x.ts'] });
  assert.equal(classifyCommit(commit).type, 'Protocol');
});

test('classifyCommit: dep-bump via conventional chore(deps)/build(deps-dev)', () => {
  const a = makeCommit({
    subject: 'chore(deps): bump lodash from 4.17.20 to 4.17.21',
    files: ['packages/taquito-rpc/package.json', 'packages/taquito-rpc/src/index.ts'],
  });
  const b = makeCommit({
    subject: 'build(deps-dev): bump typescript',
    files: ['packages/taquito-core/tsconfig.json'],
  });
  assert.equal(classifyCommit(a).type, 'Dep bump');
  assert.equal(classifyCommit(b).type, 'Dep bump');
});

test('classifyCommit: dep-bump detected via subject regex fallback even without clean conventional parse', () => {
  const commit = makeCommit({
    subject: 'chore(deps): [security] bump ws',
    files: ['packages/taquito-signer/src/x.ts'],
  });
  assert.equal(classifyCommit(commit).type, 'Dep bump');
});

test('classifyCommit: bug fix via conventional fix type', () => {
  const commit = makeCommit({
    subject: 'fix(rpc): correct header parsing',
    files: ['packages/taquito-rpc/src/index.ts'],
  });
  const result = classifyCommit(commit);
  assert.equal(result.bucket, BUCKET.ACTIONABLE);
  assert.equal(result.type, 'Bug fix');
});

test('classifyCommit: feature via conventional feat type', () => {
  const commit = makeCommit({
    subject: 'feat(signer): add ledger support',
    files: ['packages/taquito-signer/src/x.ts'],
  });
  assert.equal(classifyCommit(commit).type, 'Feature');
});

test('classifyCommit: other for refactor/test/docs/style/ci and unparseable subjects', () => {
  const subjects = [
    'refactor(core): simplify context',
    'test(rpc): add coverage',
    'docs(readme): fix link',
    'style: prettier pass',
    'ci: bump action version',
    'Merge pull request #42 from foo/bar',
  ];
  for (const subject of subjects) {
    const commit = makeCommit({ subject, files: ['packages/taquito-rpc/src/index.ts'] });
    assert.equal(classifyCommit(commit).type, 'Other', `expected Other for "${subject}"`);
  }
});

// ---------------------------------------------------------------------------
// derivePackage
// ---------------------------------------------------------------------------

test('derivePackage: uses conventional-commit scope when present', () => {
  const commit = makeCommit({ subject: 'fix(taquito-rpc): x', files: ['random/path.ts'] });
  const parsed = parseConventionalCommit(commit.subject);
  assert.equal(derivePackage(commit, parsed), 'taquito-rpc');
});

test('derivePackage: falls back to most common packages/<name> dir when no scope', () => {
  const commit = makeCommit({
    subject: 'fix: cross-package fix',
    files: [
      'packages/taquito-rpc/src/a.ts',
      'packages/taquito-rpc/src/b.ts',
      'packages/taquito-core/src/c.ts',
    ],
  });
  const parsed = parseConventionalCommit(commit.subject);
  assert.equal(parsed.scope, null);
  assert.equal(derivePackage(commit, parsed), 'taquito-rpc');
});

test('derivePackage: falls back to "taquito" for repo-root-level changes with no scope', () => {
  const commit = makeCommit({ subject: 'fix: root tsconfig tweak', files: ['tsconfig.base.json'] });
  const parsed = parseConventionalCommit(commit.subject);
  assert.equal(derivePackage(commit, parsed), 'taquito');
});

test('derivePackage: unparseable subject with no packages/ files falls back to "taquito"', () => {
  const commit = makeCommit({ subject: 'bump root deps', files: ['lerna.json'] });
  assert.equal(derivePackage(commit, null), 'taquito');
});

// ---------------------------------------------------------------------------
// groupActionableCommits / summarizeCounts
// ---------------------------------------------------------------------------

test('groupActionableCommits: groups by package then type, excludes non-actionable buckets', () => {
  const commits = [
    makeCommit({ sha: 'c1', subject: 'fix(taquito-rpc): a', files: ['packages/taquito-rpc/src/a.ts'] }),
    makeCommit({ sha: 'c2', subject: 'feat(taquito-rpc): b', files: ['packages/taquito-rpc/src/b.ts'] }),
    makeCommit({ sha: 'c3', subject: 'fix(taquito-core): c', files: ['packages/taquito-core/src/c.ts'] }),
    makeCommit({ sha: 'c4', subject: 'chore: publish', files: [] }),
    makeCommit({ sha: 'c5', subject: 'docs: site', files: ['website/x.md'] }),
  ].map((c) => ({ ...c, classification: classifyCommit(c) }));

  const grouped = groupActionableCommits(commits);
  assert.deepEqual(Array.from(grouped.keys()).sort(), ['taquito-core', 'taquito-rpc']);
  assert.equal(grouped.get('taquito-rpc').get('Bug fix').length, 1);
  assert.equal(grouped.get('taquito-rpc').get('Feature').length, 1);
  assert.equal(grouped.get('taquito-core').get('Bug fix').length, 1);
});

test('summarizeCounts: buckets counted correctly', () => {
  const commits = [
    makeCommit({ subject: 'fix(taquito-rpc): a', files: ['packages/taquito-rpc/src/a.ts'] }),
    makeCommit({ subject: 'chore: publish', files: [] }),
    makeCommit({ subject: 'docs: site', files: ['website/x.md'] }),
  ].map((c) => ({ ...c, classification: classifyCommit(c) }));

  assert.deepEqual(summarizeCounts(commits), { actionable: 1, website: 1, noise: 1, total: 3 });
});

// ---------------------------------------------------------------------------
// parseGitLogOutput
// ---------------------------------------------------------------------------

function fmt(fields) {
  return fields.join(GIT_LOG_FIELD_SEP);
}

test('parseGitLogOutput: parses multiple records with multiple/zero files', () => {
  const raw =
    GIT_LOG_RECORD_SEP +
    fmt(['sha1full', 'sha1', 'Alice', '2026-08-01T00:00:00+00:00', 'fix: a']) +
    '\npackages/taquito-rpc/src/a.ts\npackages/taquito-rpc/src/b.ts\n' +
    GIT_LOG_RECORD_SEP +
    fmt(['sha2full', 'sha2', 'Bob', '2026-08-02T00:00:00+00:00', 'chore: publish']) +
    '\n';

  const commits = parseGitLogOutput(raw);
  assert.equal(commits.length, 2);
  assert.deepEqual(commits[0], {
    sha: 'sha1full',
    shortSha: 'sha1',
    author: 'Alice',
    date: '2026-08-01T00:00:00+00:00',
    subject: 'fix: a',
    files: ['packages/taquito-rpc/src/a.ts', 'packages/taquito-rpc/src/b.ts'],
  });
  assert.deepEqual(commits[1].files, []);
  assert.equal(commits[1].subject, 'chore: publish');
});

test('parseGitLogOutput: empty/undefined input yields no commits', () => {
  assert.deepEqual(parseGitLogOutput(''), []);
  assert.deepEqual(parseGitLogOutput(undefined), []);
});

// ---------------------------------------------------------------------------
// Checkpoint marker round-trip
// ---------------------------------------------------------------------------

test('checkpoint marker: round-trips through render -> parse', () => {
  const sha = 'b'.repeat(40);
  const body = renderIssueBody({
    lastReviewedSha: sha,
    generatedAt: '2026-09-01T06:00:00.000Z',
    bootstrap: false,
    commits: [],
    repoUrl: 'https://github.com/ecadlabs/taquito.git',
  });
  assert.equal(parseCheckpointSha(body), sha);
  assert.match(body, CHECKPOINT_MARKER_RE);
});

test('checkpoint marker: bootstrap body also round-trips', () => {
  const sha = 'c'.repeat(40);
  const body = renderIssueBody({
    lastReviewedSha: sha,
    generatedAt: '2026-09-01T06:00:00.000Z',
    bootstrap: true,
    commits: [],
    repoUrl: 'https://github.com/ecadlabs/taquito.git',
  });
  assert.equal(parseCheckpointSha(body), sha);
});

test('renderCheckpointMarker produces the exact expected format', () => {
  const sha = 'd'.repeat(40);
  assert.equal(renderCheckpointMarker(sha), `<!-- octez.js:taquito-sync:last-reviewed-sha=${sha} -->`);
});

test('parseCheckpointSha: returns null when marker is missing or malformed', () => {
  assert.equal(parseCheckpointSha('no marker here'), null);
  assert.equal(parseCheckpointSha('<!-- octez.js:taquito-sync:last-reviewed-sha=short -->'), null);
  assert.equal(parseCheckpointSha(''), null);
  assert.equal(parseCheckpointSha(undefined), null);
  assert.equal(parseCheckpointSha(null), null);
});

// ---------------------------------------------------------------------------
// "Last checked" heartbeat (liveness signal on no-op runs)
// ---------------------------------------------------------------------------

test('renderIssueBody: always includes a "Last checked" line matching generatedAt', () => {
  const body = renderIssueBody({
    lastReviewedSha: 'e'.repeat(40),
    generatedAt: '2026-09-01T06:00:00.000Z',
    bootstrap: false,
    commits: [],
    repoUrl: 'https://github.com/ecadlabs/taquito.git',
  });
  assert.match(body, /^\*\*Last checked:\*\* 2026-09-01T06:00:00\.000Z$/m);
});

test('upsertLastCheckedLine: replaces an existing "Last checked" line in place, leaving the rest untouched', () => {
  const commit = makeCommit({ subject: 'fix(rpc): retry on 503' });
  const original = renderIssueBody({
    lastReviewedSha: 'f'.repeat(40),
    generatedAt: '2026-08-25T06:00:00.000Z',
    bootstrap: false,
    commits: [{ ...commit, classification: classifyCommit(commit) }],
    repoUrl: 'https://github.com/ecadlabs/taquito.git',
  });

  const patched = upsertLastCheckedLine(original, '2026-09-01T06:00:00.000Z');

  assert.match(patched, /^\*\*Last checked:\*\* 2026-09-01T06:00:00\.000Z$/m);
  // Only the heartbeat line advances — "Last reviewed" keeps its own date,
  // since a no-op run (which is the only caller of upsertLastCheckedLine)
  // by definition has nothing new to review.
  assert.match(patched, /^\*\*Last reviewed:\*\* .*2026-08-25T06:00:00\.000Z/m);
  // Everything else — the checkpoint, the actionable section — must survive untouched.
  assert.equal(parseCheckpointSha(patched), 'f'.repeat(40));
  assert.match(patched, /fix\(rpc\): retry on 503/);
});

test('upsertLastCheckedLine: inserts the line after the checkpoint marker when absent (legacy body predating this line)', () => {
  const legacyBody = [
    '<!-- Auto-generated by .github/workflows/taquito-sync.yml (runs weekly). -->',
    '',
    `**Last reviewed:** \`${'a'.repeat(40)}\` — 2026-08-01T06:00:00.000Z (link)`,
    '',
    `<!-- octez.js:taquito-sync:last-reviewed-sha=${'a'.repeat(40)} -->`,
    '',
    '### Actionable changes',
    '',
    '_No actionable (non-website, non-mechanical) commits this run._',
  ].join('\n');

  assert.doesNotMatch(legacyBody, /\*\*Last checked:\*\*/);

  const patched = upsertLastCheckedLine(legacyBody, '2026-09-01T06:00:00.000Z');

  assert.match(patched, /^\*\*Last checked:\*\* 2026-09-01T06:00:00\.000Z$/m);
  assert.equal(parseCheckpointSha(patched), 'a'.repeat(40));
  assert.match(patched, /### Actionable changes/);
});

test('upsertLastCheckedLine: throws rather than guessing when neither the heartbeat line nor a checkpoint marker is present', () => {
  assert.throws(
    () => upsertLastCheckedLine('a body with neither', '2026-09-01T06:00:00.000Z'),
    /no checkpoint marker/,
  );
});

test('upsertLastCheckedLine: repeated calls stay idempotent (one line, not an accumulating stack)', () => {
  let body = renderIssueBody({
    lastReviewedSha: 'b'.repeat(40),
    generatedAt: '2026-08-01T06:00:00.000Z',
    bootstrap: false,
    commits: [],
    repoUrl: 'https://github.com/ecadlabs/taquito.git',
  });
  body = upsertLastCheckedLine(body, '2026-08-08T06:00:00.000Z');
  body = upsertLastCheckedLine(body, '2026-08-15T06:00:00.000Z');
  body = upsertLastCheckedLine(body, '2026-08-22T06:00:00.000Z');

  const occurrences = body.match(/\*\*Last checked:\*\*/g) || [];
  assert.equal(occurrences.length, 1);
  assert.match(body, /^\*\*Last checked:\*\* 2026-08-22T06:00:00\.000Z$/m);
});

// ---------------------------------------------------------------------------
// renderIssueBody — structural assertions
// ---------------------------------------------------------------------------

test('renderIssueBody: groups actionable commits by package (alphabetical) and by TYPE_ORDER', () => {
  const commits = [
    makeCommit({
      sha: '1'.repeat(40),
      shortSha: '1111111',
      subject: 'fix(taquito-rpc): a',
      files: ['packages/taquito-rpc/src/a.ts'],
    }),
    makeCommit({
      sha: '2'.repeat(40),
      shortSha: '2222222',
      subject: 'feat(taquito-core): b',
      files: ['packages/taquito-core/src/b.ts'],
    }),
  ].map((c) => ({ ...c, classification: classifyCommit(c) }));

  const body = renderIssueBody({
    lastReviewedSha: 'e'.repeat(40),
    generatedAt: '2026-09-01T06:00:00.000Z',
    bootstrap: false,
    commits,
    repoUrl: 'https://github.com/ecadlabs/taquito.git',
  });

  // taquito-core should be rendered before taquito-rpc (alphabetical).
  assert.ok(body.indexOf('`taquito-core`') < body.indexOf('`taquito-rpc`'));
  assert.match(body, /1111111/);
  assert.match(body, /2222222/);
});

test('renderIssueBody: website commits appear in the flat website section, not grouped by package', () => {
  const commits = [
    makeCommit({
      sha: '3'.repeat(40),
      shortSha: '3333333',
      subject: 'docs: update guide',
      files: ['website/docs/guide.md'],
    }),
  ].map((c) => ({ ...c, classification: classifyCommit(c) }));

  const body = renderIssueBody({
    lastReviewedSha: 'f'.repeat(40),
    generatedAt: '2026-09-01T06:00:00.000Z',
    bootstrap: false,
    commits,
    repoUrl: 'https://github.com/ecadlabs/taquito.git',
  });

  assert.match(body, /⚠️ Website\/doc needs manual update/);
  assert.match(body, /3333333/);
  // Must not include a per-file diff/listing beyond noting website/ was touched.
  assert.doesNotMatch(body, /website\/docs\/guide\.md/);
});

test('renderIssueBody: noise commits are collapsed under <details> and still recorded', () => {
  const commits = [
    makeCommit({
      sha: '4'.repeat(40),
      shortSha: '4444444',
      subject: 'chore(release): publish 1.2.3',
      files: [],
    }),
  ].map((c) => ({ ...c, classification: classifyCommit(c) }));

  const body = renderIssueBody({
    lastReviewedSha: '9'.repeat(40),
    generatedAt: '2026-09-01T06:00:00.000Z',
    bootstrap: false,
    commits,
    repoUrl: 'https://github.com/ecadlabs/taquito.git',
  });

  assert.match(body, /<details>/);
  assert.match(body, /Mechanical \/ no action needed/);
  assert.match(body, /4444444/);
});

test('renderIssueBody: no commits ever silently dropped (every classified commit shows up somewhere)', () => {
  const commits = [
    makeCommit({ sha: 'a'.repeat(40), shortSha: 'aaa0001', subject: 'feat(taquito-rpc): a', files: ['packages/taquito-rpc/src/a.ts'] }),
    makeCommit({ sha: 'b'.repeat(40), shortSha: 'bbb0002', subject: 'website change', files: ['website/x.md'] }),
    makeCommit({ sha: 'c'.repeat(40), shortSha: 'ccc0003', subject: 'chore: publish', files: [] }),
    makeCommit({ sha: 'd'.repeat(40), shortSha: 'ddd0004', subject: 'refactor: cleanup', files: ['packages/taquito-core/src/x.ts'] }),
  ].map((c) => ({ ...c, classification: classifyCommit(c) }));

  const body = renderIssueBody({
    lastReviewedSha: '5'.repeat(40),
    generatedAt: '2026-09-01T06:00:00.000Z',
    bootstrap: false,
    commits,
    repoUrl: 'https://github.com/ecadlabs/taquito.git',
  });

  for (const c of commits) {
    assert.match(body, new RegExp(c.shortSha), `missing ${c.shortSha} from rendered body`);
  }
  assert.match(body, new RegExp(`Scanned ${commits.length} commit\\(s\\)`));
});

// ---------------------------------------------------------------------------
// Rename-detection fix (--no-renames) — classification-level
// ---------------------------------------------------------------------------

test('isWebsiteCommit: WITHOUT --no-renames, a move out of website/ would report only the ' +
  'destination path and be missed (documents the bug the fix prevents)', () => {
  // This is what `git log --name-only` (default rename detection, no
  // --no-renames) reports for `git mv website/docs/guide.md docs/guide.md`:
  // only the new path, collapsed into an implicit rename the caller never
  // sees as touching website/.
  const commitAsReportedWithoutFix = makeCommit({
    subject: 'docs: move guide out of website',
    files: ['docs/guide.md'],
  });
  assert.equal(isWebsiteCommit(commitAsReportedWithoutFix), false);
  assert.equal(classifyCommit(commitAsReportedWithoutFix).bucket, BUCKET.ACTIONABLE);
});

test('isWebsiteCommit: WITH --no-renames, the same move reports both the old and new path ' +
  'and is correctly caught by the website/ bucket', () => {
  // This is what `git log --name-only --no-renames` reports for the same
  // move: the deletion (old path) and addition (new path) as two separate
  // entries, so the website/ prefix check sees `website/docs/guide.md`.
  const commitAsReportedWithFix = makeCommit({
    subject: 'docs: move guide out of website',
    files: ['docs/guide.md', 'website/docs/guide.md'],
  });
  assert.equal(isWebsiteCommit(commitAsReportedWithFix), true);
  assert.deepEqual(classifyCommit(commitAsReportedWithFix), { bucket: BUCKET.WEBSITE });
});

// ---------------------------------------------------------------------------
// core.quotePath C-quoting defense-in-depth — classification-level
// ---------------------------------------------------------------------------

test('isWebsiteCommit: a C-quoted path (leading `"`) is routed to the website bucket even ' +
  'when it is not literally prefixed with website/ (fail closed)', () => {
  // Even with -c core.quotePath=false, a path containing a literal `"`, `\`,
  // or control character can still come back quoted. We can't safely
  // unquote-and-compare, so any such path must fail closed into the website
  // bucket rather than risk silently treating an unreadable path as safe.
  const commit = makeCommit({
    subject: 'chore: odd filename',
    files: ['"packages/taquito-rpc/src/caf\\303\\251.ts"'],
  });
  assert.equal(isWebsiteCommit(commit), true);
  assert.deepEqual(classifyCommit(commit), { bucket: BUCKET.WEBSITE });
});

test('isWebsiteCommit: a C-quoted accented website/ path is still caught (both prefix and ' +
  'quoting checks agree)', () => {
  const commit = makeCommit({
    subject: 'docs: add accented guide',
    files: ['"website/docs/caf\\303\\251.md"'],
  });
  assert.equal(isWebsiteCommit(commit), true);
});

test('isWebsiteCommit: ordinary ASCII, unquoted, non-website paths are unaffected by the ' +
  'defense-in-depth check', () => {
  const commit = makeCommit({
    subject: 'fix(rpc): x',
    files: ['packages/taquito-rpc/src/index.ts'],
  });
  assert.equal(isWebsiteCommit(commit), false);
});

// ---------------------------------------------------------------------------
// Rename-detection + quoting fix — true end-to-end via a real synthetic git
// repo (mirrors what the review pass did: no live network clone).
// ---------------------------------------------------------------------------

test('end-to-end: real git repo — a git-mv out of website/ and an accented website/ filename ' +
  'both land in the website bucket once --no-renames and core.quotePath=false are applied', () => {
  const repoDir = mkdtempSync(join(tmpdir(), 'taquito-sync-e2e-'));
  try {
    const git = (args) => execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf8' });

    git(['init', '-q', '-b', 'main']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Test User']);

    mkdirSync(join(repoDir, 'website', 'docs'), { recursive: true });
    mkdirSync(join(repoDir, 'packages', 'taquito-rpc', 'src'), { recursive: true });
    writeFileSync(join(repoDir, 'website', 'docs', 'guide.md'), '# guide\n');
    writeFileSync(join(repoDir, 'packages', 'taquito-rpc', 'src', 'index.ts'), 'export const x = 1;\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'chore: initial commit']);
    const baseSha = git(['rev-parse', 'HEAD']).trim();

    // Commit A: move a file OUT of website/ (the rename-detection failure mode).
    mkdirSync(join(repoDir, 'docs'), { recursive: true });
    git(['mv', 'website/docs/guide.md', 'docs/guide.md']);
    git(['commit', '-q', '-m', 'docs: move guide out of website']);

    // Commit B: an accented filename under website/ (the quoting failure mode).
    writeFileSync(join(repoDir, 'website', 'docs', 'café.md'), '# café guide\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'docs: add accented guide']);

    const raw = execFileSync(
      'git',
      [
        '-C',
        repoDir,
        '-c',
        'core.quotePath=false',
        'log',
        `${baseSha}..main`,
        '--no-merges',
        '--no-renames',
        '--name-only',
        GIT_LOG_FORMAT,
      ],
      { encoding: 'utf8' },
    );

    const commits = parseGitLogOutput(raw);
    assert.equal(commits.length, 2);

    const bySubject = new Map(commits.map((c) => [c.subject, c]));

    const moveCommit = bySubject.get('docs: move guide out of website');
    assert.ok(moveCommit, 'move commit not found in git log output');
    assert.ok(
      moveCommit.files.includes('website/docs/guide.md'),
      `expected old website/ path in files, got ${JSON.stringify(moveCommit.files)}`,
    );
    assert.equal(classifyCommit(moveCommit).bucket, BUCKET.WEBSITE);

    const accentCommit = bySubject.get('docs: add accented guide');
    assert.ok(accentCommit, 'accented-filename commit not found in git log output');
    assert.ok(
      accentCommit.files.some((f) => f.startsWith('website/')),
      `expected an unquoted website/ path, got ${JSON.stringify(accentCommit.files)}`,
    );
    assert.equal(classifyCommit(accentCommit).bucket, BUCKET.WEBSITE);
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// selectTrackerIssue — exact-title match
// ---------------------------------------------------------------------------

test('selectTrackerIssue: rejects a substring-matching issue and returns the exact-title match', () => {
  const results = [
    { number: 7, title: 'Taquito Sync Tracker (archived)', body: 'irrelevant' },
    { number: 12, title: 'Taquito Sync Tracker', body: 'the real one' },
  ];
  const picked = selectTrackerIssue(results, 'Taquito Sync Tracker');
  assert.equal(picked.number, 12);
  assert.equal(picked.body, 'the real one');
});

test('selectTrackerIssue: returns null when no result has an exact title match', () => {
  const results = [{ number: 7, title: 'Taquito Sync Tracker (archived)', body: 'x' }];
  assert.equal(selectTrackerIssue(results, 'Taquito Sync Tracker'), null);
});

test('selectTrackerIssue: returns null for an empty or missing result list', () => {
  assert.equal(selectTrackerIssue([], 'Taquito Sync Tracker'), null);
  assert.equal(selectTrackerIssue(undefined, 'Taquito Sync Tracker'), null);
});

// ---------------------------------------------------------------------------
// resolveTrackerState — bootstrap / corrupted / closed-issue branching
// ---------------------------------------------------------------------------

test('resolveTrackerState: no issue found -> bootstrap', () => {
  assert.deepEqual(resolveTrackerState(null), {
    bootstrap: true,
    corrupted: false,
    needsReopen: false,
    lastReviewedSha: null,
  });
});

test('resolveTrackerState: issue found with malformed/missing checkpoint -> corrupted, not bootstrap', () => {
  const issue = { number: 1, title: 'Taquito Sync Tracker', body: 'no marker here', state: 'OPEN' };
  assert.deepEqual(resolveTrackerState(issue), {
    bootstrap: false,
    corrupted: true,
    needsReopen: false,
    lastReviewedSha: null,
  });
});

test('resolveTrackerState: OPEN issue with valid checkpoint -> resume normally, no reopen', () => {
  const sha = 'a'.repeat(40);
  const issue = { number: 1, title: 'Taquito Sync Tracker', body: renderCheckpointMarker(sha), state: 'OPEN' };
  assert.deepEqual(resolveTrackerState(issue), {
    bootstrap: false,
    corrupted: false,
    needsReopen: false,
    lastReviewedSha: sha,
  });
});

test('resolveTrackerState: CLOSED issue with valid checkpoint -> not bootstrap, needs reopen, ' +
  'and its checkpoint is preserved (the bug this fixes: closed used to silently trigger bootstrap ' +
  'and reset the checkpoint to current HEAD, discarding unreviewed commits)', () => {
  const sha = 'b'.repeat(40);
  const issue = { number: 42, title: 'Taquito Sync Tracker', body: renderCheckpointMarker(sha), state: 'CLOSED' };
  const result = resolveTrackerState(issue);
  assert.equal(result.bootstrap, false);
  assert.equal(result.corrupted, false);
  assert.equal(result.needsReopen, true);
  assert.equal(result.lastReviewedSha, sha);
});
