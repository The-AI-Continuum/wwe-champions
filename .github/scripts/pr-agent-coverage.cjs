'use strict';

// PR-Agent refuses to review some files at all: bad extensions, generated
// lockfiles and minified bundles. When a pull request touches only those, the
// tool loads no diff, publishes no review comment, and the external-review gate
// used to fail closed with nothing actionable to show.
//
// This module reproduces the filter the pinned PR-Agent applies when it builds
// the diff, so the reviewer and the trusted verifier can agree that a pull
// request has no reviewable content and record explicit empty coverage instead
// of pretending a review happened.
//
// The constants mirror pr-agent==0.45.0:
//   pr_agent/settings/language_extensions.toml  [bad_extensions].default
//   pr_agent/settings/ignore.toml               [ignore].glob
//   pr_agent/algo/language_handler.py           is_valid_file()
// `use_extra_bad_extensions` stays false, so `[bad_extensions].extra` (md, txt)
// does not apply and documentation files remain reviewable.
//
// Keep this file identical to the repository's `.github/scripts` copy. A pull
// request that changes this file changed its own review tooling, so the owner
// approval rule for `.github/` changes still applies.
//
// If a repository's default branch ships a `.pr_agent.toml` that ignores more
// paths, PR-Agent reviews less than this module reports. That direction is
// safe: the gate then blocks rather than assuming empty coverage.

const PR_AGENT_VERSION = '0.45.0';

// [bad_extensions].default
const BAD_EXTENSIONS = new Set([
  'app', 'bin', 'bmp', 'bz2', 'class', 'csv', 'dat', 'db', 'dll', 'dylib',
  'egg', 'eot', 'exe', 'gif', 'gitignore', 'glif', 'gradle', 'gz', 'ico',
  'jar', 'jpeg', 'jpg', 'lo', 'lock', 'log', 'mp3', 'mp4', 'nar', 'o', 'ogg',
  'otf', 'p', 'pdf', 'png', 'pickle', 'pkl', 'pyc', 'pyd', 'pyo', 'rkt', 'so',
  'ss', 'svg', 'tar', 'tgz', 'tsv', 'ttf', 'war', 'webm', 'woff', 'woff2',
  'xz', 'zip', 'zst', 'snap', 'lockb',
]);

// is_valid_file() also rejects generated lockfiles and minified bundles.
const AUTO_GENERATED_NAMES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'composer.lock',
  'Gemfile.lock', 'poetry.lock', 'go.sum', '.terraform.lock.hcl', 'uv.lock',
  'Cargo.lock', 'Pipfile.lock', 'mix.lock', 'pubspec.lock', 'bun.lockb',
]);
const AUTO_GENERATED_SUFFIXES = ['.min.js', '.min.css', '.js.map', '.ts.map', '.css.map'];

// [ignore].glob, translated the way fnmatch.translate() does for `vendor/**`.
const IGNORED_PATH_PATTERNS = [/^vendor\/[\s\S]*$/];

function basename(filePath) {
  return String(filePath).replace(/\\/g, '/').split('/').pop();
}

// Returns null when PR-Agent would review the file, otherwise the reason it
// drops the file.
function filterReason(filename) {
  if (!filename) return 'missing-filename';
  const name = basename(filename);
  if (AUTO_GENERATED_NAMES.has(name)) return 'auto-generated';
  if (AUTO_GENERATED_SUFFIXES.some((suffix) => filename.endsWith(suffix))) return 'auto-generated';
  if (IGNORED_PATH_PATTERNS.some((pattern) => pattern.test(filename))) {
    return 'ignored-path';
  }
  const extension = filename.split('.').pop();
  if (BAD_EXTENSIONS.has(extension)) return 'bad-extension';
  return null;
}

function isReviewablePath(filename) {
  return filterReason(filename) === null;
}

// No reviewer inspects lockfile content (PR-Agent and OCR both exclude it), so a
// skipped review of a PR that touches one needs a human approver.
function isLockfilePath(filename) {
  if (!filename) return false;
  const name = basename(filename);
  return AUTO_GENERATED_NAMES.has(name) || name === 'npm-shrinkwrap.json';
}

// `files` are GitHub pull request file objects: { filename, status }.
// Removed files can still have reviewable deletion patches.
function classifyPrFiles(files) {
  if (!Array.isArray(files)) throw new TypeError('classifyPrFiles expects the GitHub file list');

  const changed = [];
  const reviewable = [];
  const filtered = [];
  for (const file of files) {
    const filename = file && file.filename;
    if (!filename || typeof filename !== 'string') throw new Error('Pull request file entry has no filename');
    changed.push(filename);
    const reason = filterReason(filename);
    if (reason === null) reviewable.push(filename);
    else filtered.push({ file: filename, reason });
  }
  changed.sort();
  reviewable.sort();
  filtered.sort((a, b) => a.file.localeCompare(b.file));
  return { prAgentVersion: PR_AGENT_VERSION, changed, reviewable, filtered };
}

module.exports = {
  PR_AGENT_VERSION,
  BAD_EXTENSIONS,
  AUTO_GENERATED_NAMES,
  AUTO_GENERATED_SUFFIXES,
  IGNORED_PATH_PATTERNS,
  isReviewablePath,
  filterReason,
  classifyPrFiles,
  isLockfilePath,
};
