#!/usr/bin/env node
// Copies root LICENSE/NOTICE into every publishable workspace package and
// ensures each package.json "files" array declares them, so users who
// `npm install` an individual octez.js package (not just the monorepo)
// receive the license text and the Apache 4(b) attribution notice.
//
// Manual step, run before cutting a release — not wired into CI.
//
// Usage:
//   node scripts/prepare-package-release.js          # copy files and fix package.json
//   node scripts/prepare-package-release.js --check   # verify only, no writes; exits 1 on drift

const { existsSync, readFileSync, writeFileSync, readdirSync, copyFileSync } = require('fs');
const { join } = require('path');

const ATTRIBUTION_FILES = ['LICENSE', 'NOTICE'];

function getPublishablePackageDirs(root) {
  const packagesDir = join(root, 'packages');

  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesDir, entry.name))
    .filter((dir) => existsSync(join(dir, 'package.json')))
    .filter((dir) => {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      return !pkg.private;
    });
}

function checkPackage(root, dir) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const problems = [];

  for (const file of ATTRIBUTION_FILES) {
    const rootContent = readFileSync(join(root, file), 'utf8');
    const packagePath = join(dir, file);

    if (!existsSync(packagePath)) {
      problems.push(`missing ${file}`);
    } else if (readFileSync(packagePath, 'utf8') !== rootContent) {
      problems.push(`${file} is out of sync with root ${file}`);
    }

    if (!(pkg.files || []).includes(file)) {
      problems.push(`"files" in package.json does not list ${file}`);
    }
  }

  if (!pkg.files) {
    problems.push('package.json has no "files" array (publishes everything unfiltered)');
  } else if (!pkg.files.includes('dist')) {
    problems.push('"files" in package.json does not list "dist"');
  }

  return { name: pkg.name, problems };
}

function fixPackage(root, dir) {
  const packageJsonPath = join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  let changed = false;

  if (!pkg.files) {
    // No "files" array means npm currently publishes everything unfiltered (respecting
    // .npmignore/.gitignore). Introducing "files" narrows that, so seed it with "dist" —
    // every publishable package here ships its build output from there — instead of
    // silently dropping everything but the two attribution files.
    pkg.files = ['dist'];
    changed = true;
  }

  for (const file of ATTRIBUTION_FILES) {
    copyFileSync(join(root, file), join(dir, file));

    if (!pkg.files.includes(file)) {
      pkg.files.push(file);
      changed = true;
    }
  }

  if (changed) {
    writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
  }

  return pkg.name;
}

function main(root) {
  const checkOnly = process.argv.includes('--check');
  const dirs = getPublishablePackageDirs(root);

  if (checkOnly) {
    const results = dirs.map((dir) => checkPackage(root, dir));
    const failures = results.filter((result) => result.problems.length > 0);

    for (const result of failures) {
      console.error(`${result.name}:`);
      for (const problem of result.problems) {
        console.error(`  - ${problem}`);
      }
    }

    if (failures.length > 0) {
      console.error(
        `\n${failures.length} of ${results.length} package(s) missing LICENSE/NOTICE attribution.\n` +
          'Run "node scripts/prepare-package-release.js" to fix.',
      );
      process.exit(1);
    }

    console.log(`All ${results.length} publishable packages carry LICENSE and NOTICE.`);
    return;
  }

  for (const dir of dirs) {
    const name = fixPackage(root, dir);
    console.log(`${name}: synced LICENSE/NOTICE`);
  }
}

if (require.main === module) {
  main(join(__dirname, '..'));
}

module.exports = {
  getPublishablePackageDirs,
  checkPackage,
  fixPackage,
};
