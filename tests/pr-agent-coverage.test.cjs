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
