// Weekly upstream drift tracker: detects new commits on ecadlabs/taquito's
// main branch that octez.js hasn't reviewed yet, and maintains a single
// always-up-to-date GitHub tracking issue listing them grouped by package and
// commit type. The review checkpoint (the last upstream SHA reviewed) is
// stored *inside the issue body* via a hidden HTML-comment marker, not in a
// repo file — every run re-derives its starting point by reading the open
// tracker issue, never from local state.
//
// LICENSING NOTE: upstream taquito/main's `website/` directory became
// proprietary/all-rights-reserved as of upstream commit 60ff0dcdd
// (2026-02-10) — see this repo's CLAUDE.md. Any commit touching a
// `website/`-prefixed path is therefore never diffed, content-summarized, or
// treated as a normal backport candidate here: it is routed to a
// distinctly-labeled "needs manual review" bucket carrying only SHA, date,
// author, and the one-line commit subject. No file list beyond noting that
// `website/` was touched, no diff, no paraphrasing of the change.
//
// Config (env vars, all optional):
//   TAQUITO_REPO_URL  default https://github.com/ecadlabs/taquito.git
//   TAQUITO_BRANCH    default main
//   ISSUE_LABEL       default taquito-sync
//   ISSUE_TITLE       default "Taquito Sync Tracker" (stable, evergreen issue;
//                      found-or-created, never a new issue per run)
//   DRY_RUN           default unset. When truthy, prints the computed issue
//                      body (and create-vs-update / diff summary) to stdout
//                      and performs NO `gh issue create/edit/comment` calls.
//
//   GH_TOKEN / GITHUB_TOKEN must be set for `gh` to authenticate (the
//   workflow sets GH_TOKEN from ${{ github.token }}).
//
// Usage:
//   node .github/scripts/taquito-sync.mjs
//   DRY_RUN=1 node .github/scripts/taquito-sync.mjs
//
// This file separates pure logic (classification, rendering, checkpoint
// parsing — all exported, no I/O) from the git-clone/`gh`-CLI side effects,
// so the pure logic can be unit-tested in isolation without network access or
// `gh`. See taquito-sync.test.mjs.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
    repoUrl: env.TAQUITO_REPO_URL || 'https://github.com/ecadlabs/taquito.git',
    branch: env.TAQUITO_BRANCH || 'main',
    issueLabel: env.ISSUE_LABEL || 'taquito-sync',
    issueTitle: env.ISSUE_TITLE || 'Taquito Sync Tracker',
    dryRun: isDryRun(env.DRY_RUN),
  };
}

// Web (https://github.com/<org>/<repo>) form of the (possibly .git-suffixed)
// clone URL, for building commit links.
export function repoWebUrl(repoUrl) {
  return repoUrl.replace(/\.git$/, '');
}

export function commitUrl(repoUrl, sha) {
  return `${repoWebUrl(repoUrl)}/commit/${sha}`;
}

// ---------------------------------------------------------------------------
// Conventional-commit parsing
// ---------------------------------------------------------------------------

const CONVENTIONAL_COMMIT_RE = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)/;

// Returns { type, scope, breaking, description } or null if the subject
// doesn't look like a conventional commit.
export function parseConventionalCommit(subject) {
  const m = CONVENTIONAL_COMMIT_RE.exec(subject || '');
  if (!m) return null;
  return {
    type: m[1],
    scope: m[2] || null,
    breaking: Boolean(m[3]),
    description: m[4],
  };
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export const BUCKET = {
  WEBSITE: 'website',
  NOISE: 'noise',
  ACTIONABLE: 'actionable',
};

// Type groups for actionable commits, in *rendering* order only (most
// interesting to a backporter first). This is deliberately NOT the
// classification precedence order — see classifyType(), which resolves
// ambiguous subjects as Protocol > Dep bump > Bug fix > Feature > Other.
export const TYPE_ORDER = ['Feature', 'Bug fix', 'Protocol', 'Dep bump', 'Other'];

const NOISE_ONLY_FILES = new Set(['package.json', 'package-lock.json', 'yarn.lock', 'CHANGELOG.md']);

// A path git still C-quoted (e.g. `"website/docs/caf\303\251.md"`) even after
// `-c core.quotePath=false` — quoting can still trigger on a literal `"`,
// `\`, or a control character in the path. We can't reliably unquote/compare
// such a path against the `website/` prefix, so treat it conservatively:
// anything we can't be sure ISN'T a website/ path gets routed to the
// website/ bucket (fail closed), per the licensing hard-stop in CLAUDE.md.
function isPossiblyQuotedPath(f) {
  return typeof f === 'string' && f.startsWith('"');
}

export function isWebsiteCommit(commit) {
  return (commit.files || []).some((f) => f.startsWith('website/') || isPossiblyQuotedPath(f));
}

export function isNoiseCommit(commit) {
  const files = commit.files || [];
  if (files.length > 0 && files.every((f) => NOISE_ONLY_FILES.has(f))) return true;
  if (/^chore\(release\)/i.test(commit.subject || '')) return true;
  if (/^chore:\s*publish/i.test(commit.subject || '')) return true;
  return false;
}

// Type classification for a non-website, non-noise commit. Priority order:
// Protocol, Dep bump, Bug fix, Feature, Other (a protocol-related commit
// might otherwise look like a plain `fix:`, so protocol is checked first).
export function classifyType(subject, parsed) {
  const scope = parsed && parsed.scope;
  if (/protocol/i.test(subject || '') || (scope && /protocol/i.test(scope))) {
    return 'Protocol';
  }

  const isDepScope = scope && /^deps(-dev)?$/i.test(scope);
  const parsedIsDepBump = parsed && (parsed.type === 'build' || parsed.type === 'chore') && isDepScope;
  const subjectIsDepBump = /^(chore|build)\(deps/i.test(subject || '');
  if (parsedIsDepBump || subjectIsDepBump) return 'Dep bump';

  if (parsed && parsed.type === 'fix') return 'Bug fix';
  if (parsed && parsed.type === 'feat') return 'Feature';

  return 'Other';
}

// Derives the package label for a non-website, non-noise commit: conventional
// commit scope if present, else the most common top-level packages/<name>
// directory among the commit's changed files, else the 'taquito' fallback
// for repo-root-level changes.
export function derivePackage(commit, parsed) {
  if (parsed && parsed.scope) return parsed.scope;

  const counts = new Map();
  for (const file of commit.files || []) {
    const m = /^packages\/([^/]+)\//.exec(file);
    if (!m) continue;
    counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  }

  let best = null;
  let bestCount = -1;
  for (const [pkg, count] of counts) {
    if (count > bestCount) {
      best = pkg;
      bestCount = count;
    }
  }
  return best || 'taquito';
}

// Classifies a single commit ({ sha, shortSha, author, date, subject, files })
// into exactly one bucket. For BUCKET.ACTIONABLE, also attaches `type` and
// `package`.
export function classifyCommit(commit) {
  if (isWebsiteCommit(commit)) return { bucket: BUCKET.WEBSITE };
  if (isNoiseCommit(commit)) return { bucket: BUCKET.NOISE };

  const parsed = parseConventionalCommit(commit.subject);
  const type = classifyType(commit.subject, parsed);
  const pkg = derivePackage(commit, parsed);
  return { bucket: BUCKET.ACTIONABLE, type, package: pkg };
}

// Groups already-classified commits ({ ...commit, classification }) into a
// Map<package, Map<type, commit[]>> for actionable commits only.
export function groupActionableCommits(classifiedCommits) {
  const byPackage = new Map();
  for (const c of classifiedCommits) {
    if (c.classification.bucket !== BUCKET.ACTIONABLE) continue;
    const { package: pkg, type } = c.classification;
    if (!byPackage.has(pkg)) byPackage.set(pkg, new Map());
    const byType = byPackage.get(pkg);
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(c);
  }
  return byPackage;
}

export function summarizeCounts(classifiedCommits) {
  let actionable = 0;
  let website = 0;
  let noise = 0;
  for (const c of classifiedCommits) {
    if (c.classification.bucket === BUCKET.WEBSITE) website++;
    else if (c.classification.bucket === BUCKET.NOISE) noise++;
    else actionable++;
  }
  return { actionable, website, noise, total: classifiedCommits.length };
}

// ---------------------------------------------------------------------------
// git log parsing (pure — operates on already-captured text)
// ---------------------------------------------------------------------------

// Field/record separators unlikely to collide with commit metadata.
export const GIT_LOG_FIELD_SEP = '\x1f';
export const GIT_LOG_RECORD_SEP = '\x1e';
export const GIT_LOG_FORMAT = `--format=${GIT_LOG_RECORD_SEP}%H${GIT_LOG_FIELD_SEP}%h${GIT_LOG_FIELD_SEP}%an${GIT_LOG_FIELD_SEP}%aI${GIT_LOG_FIELD_SEP}%s`;

// Parses `git log --name-only --format=$GIT_LOG_FORMAT` output into
// { sha, shortSha, author, date, subject, files } records.
export function parseGitLogOutput(raw) {
  if (!raw) return [];
  return raw
    .split(GIT_LOG_RECORD_SEP)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const lines = record.split('\n');
      const [sha, shortSha, author, date, subject] = lines[0].split(GIT_LOG_FIELD_SEP);
      const files = lines
        .slice(1)
        .map((l) => l.trim())
        .filter(Boolean);
      return { sha, shortSha, author, date, subject, files };
    });
}

// ---------------------------------------------------------------------------
// Checkpoint marker
// ---------------------------------------------------------------------------

export const CHECKPOINT_MARKER_RE = /<!-- octez\.js:taquito-sync:last-reviewed-sha=([0-9a-fA-F]{40}) -->/;

export function renderCheckpointMarker(sha) {
  return `<!-- octez.js:taquito-sync:last-reviewed-sha=${sha} -->`;
}

// Recovers the last-reviewed SHA from an issue body, or null if the marker is
// missing/malformed.
export function parseCheckpointSha(body) {
  if (typeof body !== 'string') return null;
  const m = CHECKPOINT_MARKER_RE.exec(body);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

// Shown in place of every commit section on the very first (bootstrap) run,
// where no history has been walked yet.
const BOOTSTRAP_PLACEHOLDER = 'No prior checkpoint found — tracking starts from this commit forward.';

function formatDateOnly(iso) {
  return (iso || '').slice(0, 10);
}

function renderCommitBullet(c, repoUrl) {
  const link = `[\`${c.shortSha}\`](${commitUrl(repoUrl, c.sha)})`;
  return `- ${link} ${c.subject} (${c.author})`;
}

// Renders the full issue body. `commits` is an array of already-classified
// commits ({ ...gitLogRecord, classification }); pass [] for bootstrap.
export function renderIssueBody({ lastReviewedSha, generatedAt, bootstrap, commits, repoUrl }) {
  const lines = [];

  lines.push('<!-- Auto-generated by .github/workflows/taquito-sync.yml (runs weekly). -->');
  lines.push('<!-- Manual edits below the checkpoint line will be overwritten on the next run. -->');
  lines.push('');
  lines.push(
    `**Last reviewed:** \`${lastReviewedSha}\` — ${generatedAt} (${commitUrl(repoUrl, lastReviewedSha)})`,
  );
  lines.push('');
  lines.push(renderCheckpointMarker(lastReviewedSha));
  lines.push('');

  if (bootstrap) {
    lines.push(BOOTSTRAP_PLACEHOLDER);
    lines.push('');
    lines.push('### Actionable changes');
    lines.push('');
    lines.push(BOOTSTRAP_PLACEHOLDER);
    lines.push('');
    lines.push('### ⚠️ Website/doc needs manual update');
    lines.push('');
    lines.push(BOOTSTRAP_PLACEHOLDER);
    lines.push('');
    lines.push('<details>');
    lines.push('<summary>Mechanical / no action needed</summary>');
    lines.push('');
    lines.push(BOOTSTRAP_PLACEHOLDER);
    lines.push('');
    lines.push('</details>');
  } else {
    const byPackage = groupActionableCommits(commits);
    const websiteCommits = commits.filter((c) => c.classification.bucket === BUCKET.WEBSITE);
    const noiseCommits = commits.filter((c) => c.classification.bucket === BUCKET.NOISE);

    lines.push('### Actionable changes');
    lines.push('');
    if (byPackage.size === 0) {
      lines.push('_No actionable (non-website, non-mechanical) commits this run._');
    } else {
      for (const pkg of Array.from(byPackage.keys()).sort()) {
        lines.push(`#### \`${pkg}\``);
        lines.push('');
        const byType = byPackage.get(pkg);
        for (const type of TYPE_ORDER) {
          const typeCommits = byType.get(type);
          if (!typeCommits || typeCommits.length === 0) continue;
          lines.push(`**${type}**`);
          lines.push('');
          for (const c of typeCommits) lines.push(renderCommitBullet(c, repoUrl));
          lines.push('');
        }
      }
    }

    lines.push('### ⚠️ Website/doc needs manual update');
    lines.push('');
    lines.push(
      '_Per this repo\'s CLAUDE.md, taquito/main `website/` content is proprietary as of upstream ' +
        'commit `60ff0dcdd` (2026-02-10) — these commits are listed for awareness only. No diff or ' +
        'content summary is included; review manually._',
    );
    lines.push('');
    if (websiteCommits.length === 0) {
      lines.push('_None this run._');
    } else {
      for (const c of websiteCommits) {
        lines.push(
          `- [\`${c.shortSha}\`](${commitUrl(repoUrl, c.sha)}) ${c.subject} — **${c.author}**, ` +
            `${formatDateOnly(c.date)} (touches \`website/\`)`,
        );
      }
    }
    lines.push('');

    lines.push('<details>');
    lines.push('<summary>Mechanical / no action needed</summary>');
    lines.push('');
    if (noiseCommits.length === 0) {
      lines.push('_None this run._');
    } else {
      for (const c of noiseCommits) {
        lines.push(`- [\`${c.shortSha}\`](${commitUrl(repoUrl, c.sha)}) ${c.subject}`);
      }
    }
    lines.push('');
    lines.push('</details>');
  }

  lines.push('');
  lines.push('---');
  lines.push(`_Scanned ${commits.length} commit(s) this run. Run at ${generatedAt}._`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// I/O — git clone/log and `gh` CLI
// ---------------------------------------------------------------------------

function cloneTaquito({ repoUrl, branch }) {
  const dir = mkdtempSync(join(tmpdir(), 'taquito-sync-'));
  execFileSync('git', ['clone', '--quiet', '--single-branch', '--branch', branch, repoUrl, dir], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return dir;
}

function getHeadSha(dir) {
  return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

// A year of upstream `--name-only` log output is a few MB at most; this cap is
// just a guard against a pathological range blowing up the child-process pipe.
const GIT_LOG_MAX_BUFFER_BYTES = 128 * 1024 * 1024;

function getCommitLogRaw(dir, lastReviewedSha, branch) {
  return execFileSync(
    'git',
    [
      '-C',
      dir,
      // core.quotePath=false: without it, git C-quotes paths containing
      // non-ASCII bytes (e.g. accented filenames), which would defeat the
      // website/ prefix check below. --no-renames: with rename detection on,
      // a commit that moves a file OUT of website/ reports only the new
      // (non-website) path, silently escaping the website/ bucket — exactly
      // the failure mode the licensing hard-stop in CLAUDE.md exists to
      // prevent. See isWebsiteCommit() for the defense-in-depth fail-closed
      // check on the remaining C-quoting edge cases (paths containing a
      // literal `"`, `\`, or control characters can still get quoted even
      // with core.quotePath=false).
      '-c',
      'core.quotePath=false',
      'log',
      `${lastReviewedSha}..${branch}`,
      '--no-merges',
      '--no-renames',
      '--name-only',
      GIT_LOG_FORMAT,
    ],
    { encoding: 'utf8', maxBuffer: GIT_LOG_MAX_BUFFER_BYTES },
  );
}

// `gh issue list --search "<title>" in:title` is a *contains* match, so a
// differently-titled labelled issue (e.g. "Taquito Sync Tracker (archived)")
// can come back in `results` alongside (or instead of) the real tracker
// issue. Filters down to an exact title match; pure, so it's unit-testable
// without invoking `gh`.
export function selectTrackerIssue(results, issueTitle) {
  const exact = (results || []).filter((r) => r.title === issueTitle);
  return exact.length ? exact[0] : null;
}

// --state all: a closed tracker issue must still be found (and reopened, see
// resolveTrackerState()/main()) rather than treated as "no issue exists" —
// the latter would take the bootstrap path, create a *second* issue, and
// silently discard every commit reviewed-but-unreported while the issue was
// closed.
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
      'number,title,body,state',
      '--limit',
      '10',
    ],
    { encoding: 'utf8' },
  );
  const results = JSON.parse(out || '[]');
  return selectTrackerIssue(results, issueTitle);
}

function withBodyFile(body, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'taquito-sync-body-'));
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

// Pure decision logic for what main() should do with a found-or-null tracker
// issue lookup — factored out so the closed-issue-is-not-a-fresh-start
// branch and the corrupted-marker branch are unit-testable without invoking
// `gh`. Performs no I/O itself (reopening the issue, logging); main() acts
// on the returned decision.
//
//   bootstrap      no tracker issue exists at all — first-ever run.
//   corrupted      issue found, but its checkpoint marker is missing/
//                  malformed — main() must hard-fail rather than guess.
//   needsReopen    issue found, valid checkpoint, but it's CLOSED — a human
//                  closed it; it must be reopened and resumed from its
//                  checkpoint, never treated as bootstrap.
//   lastReviewedSha the checkpoint to resume from (null for bootstrap/corrupted).
export function resolveTrackerState(issue) {
  if (issue === null) {
    return { bootstrap: true, corrupted: false, needsReopen: false, lastReviewedSha: null };
  }
  const lastReviewedSha = parseCheckpointSha(issue.body);
  if (!lastReviewedSha) {
    return { bootstrap: false, corrupted: true, needsReopen: false, lastReviewedSha: null };
  }
  return {
    bootstrap: false,
    corrupted: false,
    needsReopen: issue.state === 'CLOSED',
    lastReviewedSha,
  };
}

export async function main(env = process.env) {
  const config = loadConfig(env);

  const issue = findTrackerIssue(config);
  const state = resolveTrackerState(issue);

  if (state.corrupted) {
    console.error(
      `Tracker issue #${issue.number} ("${issue.title}") was found but its checkpoint marker ` +
        `(<!-- octez.js:taquito-sync:last-reviewed-sha=... -->) is missing or malformed. This looks ` +
        `like a corrupted or hand-edited issue body, not a fresh start. Refusing to guess a fallback ` +
        `SHA — fix the issue body (restore the marker) or delete/recreate the issue, then re-run.`,
    );
    process.exit(1);
  }

  const { bootstrap, lastReviewedSha } = state;

  // A human closed the tracker issue. Treating this as "no issue exists"
  // would take the bootstrap path below, create a *second* issue, and reset
  // the checkpoint to current HEAD — silently discarding every commit that
  // arrived while the issue was closed. Reopen it instead and proceed
  // normally from its existing checkpoint.
  if (state.needsReopen) {
    if (config.dryRun) {
      console.log(
        `[DRY_RUN] Tracker issue #${issue.number} is closed — would REOPEN it and continue from ` +
          `its checkpoint \`${lastReviewedSha}\`.`,
      );
    } else {
      reopenIssue(issue.number);
      console.log(`Reopened tracker issue #${issue.number} (was closed) — resuming from its checkpoint.`);
    }
  }

  let tmpDir;
  try {
    tmpDir = cloneTaquito(config);
    const headSha = getHeadSha(tmpDir);
    const generatedAt = new Date().toISOString();

    if (bootstrap) {
      const body = renderIssueBody({
        lastReviewedSha: headSha,
        generatedAt,
        bootstrap: true,
        commits: [],
        repoUrl: config.repoUrl,
      });

      if (config.dryRun) {
        console.log('[DRY_RUN] No tracker issue found — would CREATE it.');
        console.log('--- issue body ---');
        console.log(body);
        return;
      }

      const out = createIssue(config, body);
      console.log(`Created tracker issue. ${out}`);
      return;
    }

    const raw = getCommitLogRaw(tmpDir, lastReviewedSha, config.branch);
    const commits = parseGitLogOutput(raw);

    if (commits.length === 0) {
      console.log('No new commits since last checkpoint. Nothing to do.');
      return;
    }

    const classified = commits.map((c) => ({ ...c, classification: classifyCommit(c) }));
    const body = renderIssueBody({
      lastReviewedSha: headSha,
      generatedAt,
      bootstrap: false,
      commits: classified,
      repoUrl: config.repoUrl,
    });
    const summary = summarizeCounts(classified);
    const commentBody =
      `Updated ${formatDateOnly(generatedAt)}: ${summary.total} new commits since last check ` +
      `(${summary.actionable} actionable, ${summary.website} website/doc flags, ${summary.noise} noise).`;

    if (config.dryRun) {
      console.log(`[DRY_RUN] Tracker issue #${issue.number} found — would UPDATE it.`);
      console.log(`[DRY_RUN] Diff summary: ${JSON.stringify(summary)}`);
      console.log('--- issue body ---');
      console.log(body);
      console.log('--- comment ---');
      console.log(commentBody);
      return;
    }

    updateIssue(issue.number, body);
    commentOnIssue(issue.number, commentBody);
    console.log(`Updated tracker issue #${issue.number}. ${commentBody}`);
  } finally {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
}
