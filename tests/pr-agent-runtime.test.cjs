const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

// The external review installs its runtime from the trusted default-branch checkout. When that
// checkout has no runtime yet, the real install step must fail closed: no venv, nothing exported
// for the review step, and no fallback to an unreviewed PR-Agent.
test('installing the reviewed runtime fails closed when the trusted checkout lacks it', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/independent-review.yml'), 'utf8');
  const step = workflow.match(/ {6}- name: Install reviewed PR-Agent runtime\n {8}run: \|\n((?: {10}.*\n)+)/);
  assert.ok(step, 'install step is missing');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-agent-install-'));
  try {
    const checkout = path.join(dir, 'checkout');
    const runnerTemp = path.join(dir, 'runner-temp');
    const githubEnv = path.join(dir, 'github-env');
    fs.mkdirSync(checkout);
    fs.mkdirSync(runnerTemp);
    fs.writeFileSync(githubEnv, '');
    const run = spawnSync('bash', ['-c', step[1].replace(/^ {10}/gm, '')], {
      cwd: checkout,
      env: { ...process.env, RUNNER_TEMP: runnerTemp, GITHUB_ENV: githubEnv },
      encoding: 'utf8',
    });
    assert.notEqual(run.status, 0);
    assert.match(run.stdout + run.stderr, /::error::The trusted default branch has no \.github\/scripts\/pr-agent-runtime/);
    assert.equal(fs.readFileSync(githubEnv, 'utf8'), '');
    assert.deepEqual(fs.readdirSync(runnerTemp), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
