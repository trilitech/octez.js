#!/usr/bin/env node

// Local linter for the taquito -> octez.js rebrand (see CLAUDE.md, "Naming: the
// rename is comprehensive but not 100% finished"). Greps every git-tracked file
// for known leftover patterns (ecadlabs mentions, taquito.io URLs, stale
// @taquito/* package scopes, ecadinfra RPC/infra hostnames, stale TAQUITO_* env var prefixes, stale
// Taquito-branded identifiers like `TaquitoError`) and fails if it finds one
// that isn't already accounted for in rebrand-lint.allowlist.json.
//
// This is intentionally NOT wired into `npm run lint` or CI yet -- run it by
// hand with `npm run check:rebrand` (or `node ./scripts/rebrand-lint.js`).

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const defaultAllowlistPath = path.join(__dirname, 'rebrand-lint.allowlist.json');

// Scans every file `git ls-files` reports (so it automatically respects
// .gitignore -- dist/, node_modules/, coverage/, .nx/, website/dist/, etc. are
// never tracked), minus a short list of binary extensions that can't
// meaningfully match a text pattern.
const SKIP_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'ico', 'woff', 'woff2', 'ttf', 'eot', 'params']);

const PATTERNS = [
  {
    id: 'ecadlabs',
    regex: /ecadlabs/gi,
    label: 'ecadlabs org/brand reference',
  },
  {
    id: 'ecadinfra',
    regex: /ecadinfra/gi,
    label: 'ecadinfra host (decommissioned or internal-only ECAD infra)',
  },
  {
    id: 'ecad-tezos-node',
    regex: /ecad-tezos-/g,
    label: 'ecad-tezos-* internal node name',
  },
  {
    id: 'taquito-io',
    regex: /taquito\.io/gi,
    label: 'taquito.io doc URL',
  },
  {
    id: 'taquito-scope',
    regex: /@taquito\//g,
    label: 'stale @taquito/* npm package scope',
  },
  {
    id: 'taquito-env-prefix',
    regex: /\bTAQUITO_[A-Z0-9_]+\b/g,
    label: 'stale TAQUITO_* env var prefix',
  },
  {
    id: 'taquito-identifier',
    // Compound identifiers only (TaquitoError, taquitoCore, ...) -- deliberately
    // does not match the bare word "Taquito", which shows up constantly and
    // legitimately in prose describing the fork (see CLAUDE.md).
    regex: /\b[Tt]aquito[A-Z][A-Za-z0-9]*\b/g,
    label: 'stale Taquito-branded identifier (variable/type/global name)',
  },
];

const PATTERN_IDS = new Set(PATTERNS.map((p) => p.id));

// Minimal glob-to-regex converter for matching allowlist `file` globs against a
// relative path string (not filesystem globbing, so no dependency needed):
// `*` matches within one path segment, `**` matches across segments.
function globToRegExp(pattern) {
  let source = '^';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '*' && pattern[i + 1] === '*') {
      source += '.*';
      i++;
      if (pattern[i + 1] === '/') i++;
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else if ('.+^${}()|[]\\'.includes(char)) {
      source += `\\${char}`;
    } else {
      source += char;
    }
  }
  source += '$';
  return new RegExp(source);
}

function loadAllowlist(allowlistPath = defaultAllowlistPath) {
  const raw = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));

  return raw.map((entry) => {
    if (!entry.pattern || !entry.file || !entry.reason) {
      throw new Error(
        `Invalid allowlist entry in ${allowlistPath} (needs pattern, file, reason): ${JSON.stringify(entry)}`
      );
    }
    if (entry.pattern !== '*' && !PATTERN_IDS.has(entry.pattern)) {
      throw new Error(
        `Allowlist entry in ${allowlistPath} references unknown pattern "${entry.pattern}". ` +
          `Known patterns: *, ${[...PATTERN_IDS].join(', ')}`
      );
    }
    return { ...entry, matcher: globToRegExp(entry.file) };
  });
}

// Every file `git ls-files` reports, which is exactly "the whole repo minus
// whatever .gitignore excludes" -- no separate exclude list to keep in sync.
function listTrackedFiles(rootDir) {
  return execFileSync('git', ['ls-files'], { cwd: rootDir, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((file) => !SKIP_EXTENSIONS.has(path.extname(file).slice(1).toLowerCase()));
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function scanForRebrandLeftovers({
  rootDir = repoRoot,
  files = listTrackedFiles(rootDir),
  patterns = PATTERNS,
  allowlist = loadAllowlist(),
} = {}) {
  const violations = [];
  const allowed = [];
  const usedAllowlistEntries = new Set();

  for (const relativePath of files) {
    const source = fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

    for (const { id, regex, label } of patterns) {
      for (const match of source.matchAll(regex)) {
        const finding = {
          patternId: id,
          label,
          file: relativePath,
          line: lineNumberAt(source, match.index),
          match: match[0],
        };

        const allowlistEntry = allowlist.find(
          (entry) => (entry.pattern === id || entry.pattern === '*') && entry.matcher.test(relativePath)
        );

        if (allowlistEntry) {
          usedAllowlistEntries.add(allowlistEntry);
          allowed.push({ ...finding, reason: allowlistEntry.reason });
        } else {
          violations.push(finding);
        }
      }
    }
  }

  const unusedAllowlistEntries = allowlist.filter((entry) => !usedAllowlistEntries.has(entry));

  return { violations, allowed, unusedAllowlistEntries };
}

function formatFinding(finding) {
  return `  ${finding.file}:${finding.line}  [${finding.patternId}] ${finding.match}`;
}

if (require.main === module) {
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
  const { violations, allowed, unusedAllowlistEntries } = scanForRebrandLeftovers();

  if (verbose && allowed.length > 0) {
    console.log(`Allow-listed (tracked) rebrand leftovers: ${allowed.length}\n`);
    for (const finding of allowed) {
      console.log(formatFinding(finding));
      console.log(`    ${finding.reason}`);
    }
    console.log('');
  }

  if (unusedAllowlistEntries.length > 0) {
    console.warn(`Warning: ${unusedAllowlistEntries.length} allowlist entr(y/ies) matched nothing (stale?):\n`);
    for (const entry of unusedAllowlistEntries) {
      console.warn(`  pattern "${entry.pattern}" file "${entry.file}"`);
    }
    console.warn('Consider removing them from scripts/rebrand-lint.allowlist.json.\n');
  }

  if (violations.length > 0) {
    console.error(`Found ${violations.length} unreviewed rebrand leftover(s):\n`);
    for (const finding of violations) {
      console.error(formatFinding(finding));
    }
    console.error(
      '\nEach match above is either a spot the taquito -> octez.js rebrand missed, or a deliberate,' +
        '\nknown exception that belongs in scripts/rebrand-lint.allowlist.json with a justification.' +
        '\nSee CLAUDE.md ("Naming: the rename is comprehensive but not 100% finished") before deciding which.'
    );
    process.exit(1);
  }

  console.log(`No unreviewed rebrand leftovers found (${allowed.length} tracked exception(s) allow-listed).`);
}

module.exports = {
  scanForRebrandLeftovers,
  loadAllowlist,
  listTrackedFiles,
  formatFinding,
  PATTERNS,
};
