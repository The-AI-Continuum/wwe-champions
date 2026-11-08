const assert = require('node:assert/strict');
const test = require('node:test');
const { validateOcrResult } = require('../.github/scripts/validate-ocr-result.cjs');

const head = 'a'.repeat(40);
const selectedFile = {
  item_id: 'source-file-1',
  path: 'src/App.tsx',
  fingerprint: 'b'.repeat(64),
};

function completeResult(overrides = {}) {
  return {
    status: 'complete',
    manifest: {
      terminal_state: 'complete',
      schema_version: 'ocr.run-manifest/v1',
      operation: 'review',
      input: { resolved_head: head },
      execution: { model: 'qwen/qwen3-coder-flash' },
      coverage: {
        selected: [selectedFile],
        completed: [selectedFile],
        reused: [],
        failed: [],
        waived: [],
      },
    },
    llm: { model: 'qwen/qwen3-coder-flash' },
    warnings: [],
    ...overrides,
  };
}

test('accepts complete matching coverage and OCR built-in unsupported files', () => {
  const result = validateOcrResult(completeResult(), head, ['src/App.tsx', 'README.md']);
  assert.equal(result.status, 'complete');
  assert.equal(result.selectedFiles, 1);
});

test('rejects a changed reviewable source file missing from OCR selection', () => {
  assert.throws(
    () => validateOcrResult(completeResult(), head, ['src/App.tsx', 'src/other.ts']),
    /changed file that OCR can review was not selected/,
  );
});

test('rejects evidence for a different current head', () => {
  assert.throws(
    () => validateOcrResult(completeResult(), 'c'.repeat(40), ['src/App.tsx']),
    /reviewed SHA does not match the current PR head/,
  );
});

test('rejects failed or waived selected coverage', () => {
  const result = completeResult();
  result.manifest.coverage.failed = [{ item_id: 'failed' }];
  assert.throws(
    () => validateOcrResult(result, head, ['src/App.tsx']),
    /selected coverage has failed or waived items/,
  );
});

test('rejects a failed review round even when the result says complete', () => {
  const result = completeResult({ warnings: [{ type: 'review_round_failed' }] });
  assert.throws(
    () => validateOcrResult(result, head, ['src/App.tsx']),
    /review warnings are malformed or a requested review round failed/,
  );
});

function skippedResult() {
  const result = completeResult({ status: 'skipped' });
  result.manifest.terminal_state = 'skipped';
  result.manifest.coverage.selected = [];
  result.manifest.coverage.completed = [];
  return result;
}

// CI explicitly selects tests and fixtures, so OCR omitting one must block rather than
// be treated as a file OCR's built-in filter never reviews.
const explicitlyIncludedPaths = [
  'tests/ocr-validator.test.cjs',
  'test/auth.test.ts',
  'src/__tests__/a.js',
  'tests/fixtures/data.json',
  'pkg/foo_test.go',
];

for (const changed of explicitlyIncludedPaths) {
  test(`rejects ${changed} omitted from a skipped or partial review`, () => {
    assert.throws(() => validateOcrResult(skippedResult(), head, [changed]), /was not selected for review/);
    assert.throws(
      () => validateOcrResult(completeResult(), head, ['src/App.tsx', changed]),
      /was not selected for review/,
    );
  });
}

test('accepts a test file and a fixture that OCR selected and completed', () => {
  const testFile = { item_id: 'test-1', path: 'tests/ocr-validator.test.cjs', fingerprint: 'c'.repeat(64) };
  const fixture = { item_id: 'fixture-1', path: 'tests/fixtures/data.json', fingerprint: 'd'.repeat(64) };
  const result = completeResult();
  result.manifest.coverage.selected = [selectedFile, testFile, fixture];
  result.manifest.coverage.completed = [selectedFile, testFile, fixture];
  const verdict = validateOcrResult(result, head, ['src/App.tsx', testFile.path, fixture.path]);
  assert.equal(verdict.selectedFiles, 3);
});

test('lockfile-only skipped review is permitted by the explicit no-reviewable-files policy', () => {
  const { classifyPrFiles } = require('../.github/scripts/pr-agent-coverage.cjs');
  const files = [{ filename: 'package-lock.json', status: 'modified' }];
  const coverage = classifyPrFiles(files);
  assert.deepEqual(coverage.reviewable, []);
  assert.deepEqual(coverage.filtered, [{ file: 'package-lock.json', reason: 'auto-generated' }]);
  assert.equal(validateOcrResult(skippedResult(), head, ['package-lock.json']).skipped, true);
});

test('still accepts a skipped review of files OCR never reviews', () => {
  assert.equal(validateOcrResult(skippedResult(), head, ['README.md']).skipped, true);
});
