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
