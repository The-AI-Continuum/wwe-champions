const assert = require('node:assert/strict');
const test = require('node:test');
const { classifyPrFiles, isLockfilePath } = require('../.github/scripts/pr-agent-coverage.cjs');

test('dependency lockfiles are recognised by basename at any depth', () => {
  for (const file of ['package-lock.json', 'web/pnpm-lock.yaml', 'Cargo.lock', 'go.sum', 'npm-shrinkwrap.json', 'nested/yarn.lock', 'bun.lock', 'nested/flake.lock', 'deno.lock', 'Podfile.lock', 'conan.lock', 'custom.lockb', 'Package.resolved', 'Cartfile.resolved', 'packages.lock.json', 'gradle.lockfile', 'go.work.sum']) {
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

test('removed source patches remain reviewable alongside a filtered lockfile', () => {
  const coverage = classifyPrFiles([
    { filename: 'package-lock.json', status: 'modified' },
    { filename: 'src/removed.ts', status: 'removed', patch: '@@ -1 +0,0 @@\n-const removed = true;' },
  ]);
  assert.deepEqual(coverage.changed, ['package-lock.json', 'src/removed.ts']);
  assert.deepEqual(coverage.reviewable, ['src/removed.ts']);
  assert.equal(coverage.filtered.some(entry => entry.file === 'package-lock.json'), true);
});

test('vendor glob matches raw paths and includes newline characters', () => {
  const coverage = classifyPrFiles([
    { filename: 'vendor/library.ts', status: 'modified' },
    { filename: 'vendor/line\nbreak.ts', status: 'modified' },
    { filename: 'vendor\\library.ts', status: 'modified' },
    { filename: 'src/vendor/library.ts', status: 'modified' },
    { filename: 'dir\\package-lock.json', status: 'modified' },
  ]);
  assert.deepEqual(coverage.reviewable, ['src/vendor/library.ts', 'vendor\\library.ts']);
  assert.equal(coverage.filtered.find(entry => entry.file === 'vendor/line\nbreak.ts').reason, 'ignored-path');
  assert.equal(coverage.filtered.find(entry => entry.file === 'vendor/library.ts').reason, 'ignored-path');
  assert.equal(coverage.filtered.find(entry => entry.file === 'dir\\package-lock.json').reason, 'auto-generated');
});

test('skipped lockfile changes and renames require current-head owner approval', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/pr-verdict.yml'), 'utf8');
  const start = workflow.indexOf('                let lockfileSkip = false;');
  const end = workflow.indexOf("                if (reviewStatus === 'completed')", start);
  assert.ok(start >= 0 && end > start, 'skip verification and owner approval guard are missing');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const execute = new AsyncFunction('github', 'context', 'process', 'evidence', 'verdict', 'prFileList', 'reviewStatus', 'require', workflow.slice(start, end));
  const current = 'a'.repeat(40);
  for (const prFileList of [
    [{ filename: 'nested/bun.lock', status: 'modified' }],
    [{ filename: 'flake.lock', status: 'removed' }],
    [{ filename: 'vendor/Package.resolved', status: 'modified' }],
    [{ filename: 'custom.lockb', status: 'modified' }],
    ...['package-lock.json', 'bun.lock', 'nested/flake.lock', 'custom.lock', 'custom.lockb', 'Package.resolved', 'Cartfile.resolved', 'go.work.sum'].map(previous_filename =>
      [{ filename: 'vendor/dependency.json', previous_filename, status: 'renamed' }]),
  ]) {
    const evidence = {
      pr: { number: 1, headSha: current },
      externalReview: { reason: 'no-reviewable-files', coverage: classifyPrFiles(prFileList) },
    };
    assert.deepEqual(evidence.externalReview.coverage.reviewable, []);
    for (const approved of [false, true]) {
      const verdict = { blockReasons: [] };
      const reviews = approved ? [{ user: { login: 'owner', type: 'User' }, state: 'APPROVED', commit_id: current }] : [];
      const github = { rest: { pulls: { listReviews() {} } }, paginate: async () => reviews };
      await execute(github, { repo: { owner: 'org', repo: 'repo' } }, { env: { OWNER_APPROVER_LOGIN: 'owner' } },
        evidence, verdict, prFileList, 'skipped', () => ({ classifyPrFiles, isLockfilePath }));
      assert.equal(verdict.blockReasons.length === 0, approved, JSON.stringify(prFileList));
      if (!approved) assert.match(verdict.blockReasons[0], /dependency lockfiles/);
    }
  }
});

test('lockfile skip requires the effective human owner approval on the current head', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/pr-verdict.yml'), 'utf8');
  const start = workflow.indexOf('                if (lockfileSkip || prFileList.length >= 3000');
  const end = workflow.indexOf("                if (reviewStatus === 'completed')", start);
  assert.ok(start >= 0 && end > start, 'owner approval guard is missing');
  const guard = workflow.slice(start, end);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const execute = new AsyncFunction('github', 'context', 'process', 'evidence', 'verdict', 'prFileList', 'lockfileSkip', guard);
  const current = 'a'.repeat(40);
  const review = (state, commit_id = current, type = 'User') => ({
    user: { login: 'owner', type }, state, commit_id,
  });
  const cases = [
    { reviews: [], pass: false },
    { reviews: [review('APPROVED')], pass: true },
    { reviews: [review('APPROVED'), review('COMMENTED')], pass: true },
    { reviews: [review('APPROVED'), review('CHANGES_REQUESTED')], pass: false },
    { reviews: [review('DISMISSED')], pass: false },
    { reviews: [review('APPROVED', 'b'.repeat(40))], pass: false },
    { reviews: [review('APPROVED', current, 'Bot')], pass: false },
  ];
  for (const item of cases) {
    const verdict = { blockReasons: [] };
    const github = { rest: { pulls: { listReviews() {} } }, paginate: async () => item.reviews };
    await execute(github, { repo: { owner: 'org', repo: 'repo' } },
      { env: { OWNER_APPROVER_LOGIN: 'owner' } }, { pr: { number: 1, headSha: current } },
      verdict, [{ filename: 'package-lock.json' }], true);
    assert.equal(verdict.blockReasons.length === 0, item.pass, JSON.stringify(item.reviews));
  }
});
