const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { classifyPrFiles } = require('../.github/scripts/pr-agent-coverage.cjs');

// Temporary validation: the fixture is synthetic, shaped like GitHub's pull request files API.
const files = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ciroll-live-pr-files.json'), 'utf8'));

test('a removed source file stays reviewable while the lockfile is filtered as auto-generated', () => {
  const coverage = classifyPrFiles(files);
  assert.deepEqual(new Set(coverage.changed), new Set(['src/legacy/removedHelper.ts', 'package-lock.json']));
  assert.deepEqual(coverage.reviewable, ['src/legacy/removedHelper.ts']);
  assert.deepEqual(coverage.filtered, [{ file: 'package-lock.json', reason: 'auto-generated' }]);
});
