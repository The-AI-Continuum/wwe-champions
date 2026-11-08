const assert = require('node:assert/strict');
const test = require('node:test');
const { validateOcrResult, resolveOcrArtifact } = require('../.github/scripts/validate-ocr-result.cjs');

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

// resolveOcrArtifact: the review gate's trust boundary between the PR head and the raw OCR
// evidence it downloads. The fake client answers like the GitHub REST API for one repository.
const repo = { owner: 'The-AI-Continuum', repo: 'wwe-champions' };
const runId = 111;
const jobId = 222;
const jobStartedAt = '2026-11-07T10:00:00Z';
const jobCompletedAt = '2026-11-07T10:05:00Z';

function ocrCheck(overrides = {}) {
  return {
    id: 900,
    name: 'Code review (OCR)',
    app: { slug: 'github-actions' },
    status: 'completed',
    conclusion: 'success',
    details_url: `https://github.com/${repo.owner}/${repo.repo}/actions/runs/${runId}/job/${jobId}`,
    ...overrides,
  };
}

function ocrJob(overrides = {}) {
  return {
    id: jobId,
    run_id: runId,
    head_sha: head,
    run_attempt: 1,
    name: 'Code review (OCR)',
    status: 'completed',
    conclusion: 'success',
    started_at: jobStartedAt,
    completed_at: jobCompletedAt,
    ...overrides,
  };
}

function ocrArtifact(overrides = {}) {
  return {
    id: 5000,
    name: `ocr-review-result-${runId}-1`,
    expired: false,
    created_at: '2026-11-07T10:04:00Z',
    ...overrides,
  };
}

function fakeGithub({ checks = [ocrCheck()], jobs = [ocrJob()], artifacts = [ocrArtifact()] } = {}) {
  const listForRef = async params => ({ data: params.ref === head ? checks : [] });
  const listWorkflowRunArtifacts = async params => ({ data: params.run_id === runId ? artifacts : [] });
  return {
    paginate: async (method, params) => (await method(params)).data,
    rest: {
      checks: { listForRef },
      actions: {
        listWorkflowRunArtifacts,
        getJobForWorkflowRun: async params => {
          const job = jobs.find(value => value.id === params.job_id);
          if (!job) throw new Error('Not Found');
          return { data: job };
        },
      },
    },
  };
}

const resolve = fixture => resolveOcrArtifact(fakeGithub(fixture), repo, head);
const invalidCheck = /latest OCR check is not a successful GitHub Actions check/;
const invalidJob = /workflow job identity, attempt or SHA is invalid/;
const missingOrAmbiguousArtifact = /raw review artifact is missing, expired or ambiguous/;

test('resolves the raw review artifact of the successful OCR job for the PR head', async () => {
  assert.deepEqual(await resolve(), {
    runId,
    attempt: 1,
    artifactName: `ocr-review-result-${runId}-1`,
    headSha: head,
    artifactId: 5000,
    checkId: 900,
    jobId,
  });
});

test('rejects a PR head with no OCR check', async () => {
  await assert.rejects(resolve({ checks: [] }), invalidCheck);
});

test('rejects an OCR check that did not succeed', async () => {
  await assert.rejects(resolve({ checks: [ocrCheck({ conclusion: 'failure' })] }), invalidCheck);
  await assert.rejects(resolve({ checks: [ocrCheck({ status: 'in_progress', conclusion: null })] }), invalidCheck);
});

test('rejects an OCR check posted by an app other than GitHub Actions', async () => {
  await assert.rejects(resolve({ checks: [ocrCheck({ app: { slug: 'impostor-app' } })] }), invalidCheck);
});

test('rejects when the latest OCR check failed even though an earlier one succeeded', async () => {
  const checks = [ocrCheck(), ocrCheck({ id: 901, conclusion: 'failure' })];
  await assert.rejects(resolve({ checks }), invalidCheck);
});

test('rejects an OCR check whose job URL points at another repository', async () => {
  const details_url = `https://github.com/someone-else/${repo.repo}/actions/runs/${runId}/job/${jobId}`;
  await assert.rejects(resolve({ checks: [ocrCheck({ details_url })] }), /check URL does not belong to this repository/);
});

test('rejects a workflow job that is not the OCR job named by the check', async () => {
  await assert.rejects(resolve({ jobs: [ocrJob({ name: 'Some other job' })] }), invalidJob);
  await assert.rejects(resolve({ jobs: [ocrJob({ run_id: runId + 1 })] }), invalidJob);
  await assert.rejects(resolve({ jobs: [ocrJob({ run_attempt: 0 })] }), invalidJob);
  await assert.rejects(resolve({ jobs: [ocrJob({ conclusion: 'failure' })] }), invalidJob);
});

test('rejects a workflow job that reviewed a different head SHA', async () => {
  await assert.rejects(resolve({ jobs: [ocrJob({ head_sha: 'c'.repeat(40) })] }), invalidJob);
});

test('rejects when the OCR run has no unexpired raw review artifact', async () => {
  await assert.rejects(resolve({ artifacts: [] }), missingOrAmbiguousArtifact);
  await assert.rejects(resolve({ artifacts: [ocrArtifact({ expired: true })] }), missingOrAmbiguousArtifact);
  await assert.rejects(resolve({ artifacts: [ocrArtifact({ name: 'unrelated-artifact' })] }), missingOrAmbiguousArtifact);
});

test('rejects when more than one artifact could be the raw review evidence', async () => {
  const artifacts = [
    ocrArtifact({ id: 5001, name: `ocr-review-result-${runId}-1`, created_at: '2026-11-07T10:02:00Z' }),
    ocrArtifact({ id: 5002, name: `ocr-review-result-${runId}-2`, created_at: '2026-11-07T10:03:00Z' }),
  ];
  await assert.rejects(resolve({ jobs: [ocrJob({ run_attempt: 3 })], artifacts }), missingOrAmbiguousArtifact);
});

test('on a job rerun, selects the artifact uploaded while the successful job ran', async () => {
  // Attempt 3 uploaded under a lagging attempt-2 name; attempts 1 and 2 left their own artifacts.
  const artifacts = [
    ocrArtifact({ id: 5001, name: `ocr-review-result-${runId}-1`, created_at: '2026-11-07T09:00:00Z' }),
    ocrArtifact({ id: 5002, name: `ocr-review-result-${runId}-2`, created_at: '2026-11-07T09:30:00Z' }),
    ocrArtifact({ id: 5003, name: `ocr-review-result-${runId}-2`, created_at: '2026-11-07T10:04:00Z' }),
  ];
  const source = await resolve({ jobs: [ocrJob({ run_attempt: 3 })], artifacts });
  assert.equal(source.artifactId, 5003);
  assert.equal(source.artifactName, `ocr-review-result-${runId}-2`);
  assert.equal(source.attempt, 3);
});

test('on a job rerun, rejects when no artifact was uploaded while the successful job ran', async () => {
  const artifacts = [
    ocrArtifact({ id: 5001, name: `ocr-review-result-${runId}-1`, created_at: '2026-11-07T09:00:00Z' }),
    ocrArtifact({ id: 5002, name: `ocr-review-result-${runId}-2`, created_at: '2026-11-07T10:06:00Z' }),
  ];
  await assert.rejects(resolve({ jobs: [ocrJob({ run_attempt: 3 })], artifacts }), missingOrAmbiguousArtifact);
});
