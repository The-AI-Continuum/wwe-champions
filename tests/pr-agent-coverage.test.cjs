const assert = require('node:assert/strict');
const test = require('node:test');
const { classifyPrFiles, isLockfilePath } = require('../.github/scripts/pr-agent-coverage.cjs');

test('dependency lockfiles are recognised by basename at any depth', () => {
  for (const file of ['package-lock.json', 'web/pnpm-lock.yaml', 'Cargo.lock', 'go.sum', 'npm-shrinkwrap.json', 'nested/yarn.lock']) {
    assert.equal(isLockfilePath(file), true, file);
  }
});

test('files that only resemble lockfiles are not lockfiles', () => {
  for (const file of ['src/lock.ts', 'docs/package-lock.json.md', 'notes.lock.txt', '.gitignore', 'assets/icon.svg', '']) {
    assert.equal(isLockfilePath(file), false, file);
  }
});

test('a lockfile-only change has no reviewable files and names the lockfile as filtered', () => {
  const coverage = classifyPrFiles([{ filename: 'package-lock.json', status: 'modified' }]);
  assert.deepEqual(coverage.reviewable, []);
  assert.equal(coverage.filtered.some(entry => isLockfilePath(entry.file)), true);
});

test('a lockfile alongside a reviewable file leaves that file reviewable', () => {
  const coverage = classifyPrFiles([
    { filename: 'package-lock.json', status: 'modified' },
    { filename: 'src/App.tsx', status: 'modified' },
  ]);
  assert.deepEqual(coverage.reviewable, ['src/App.tsx']);
});
