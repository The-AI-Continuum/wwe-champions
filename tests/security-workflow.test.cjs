const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/security.yml'), 'utf8');
const scan = workflow.match(/^ +semgrep scan .+$/m)?.[0] ?? '';
const configs = [...scan.matchAll(/--config=(\S+)/g)].map(match => match[1]);

test('SAST keeps its required check name', () => {
  assert.match(workflow, /^  sast:\n    name: SAST$/m);
});

test('SAST runs code-analysis rules for TypeScript, Python and GitHub Actions', () => {
  for (const ruleset of ['p/default', 'p/typescript', 'p/python', 'p/github-actions']) {
    assert.ok(configs.includes(ruleset), `SAST must run ${ruleset}`);
  }
  assert.ok(!configs.includes('p/secrets'), 'Secrets scan owns secret detection; SAST must not duplicate it');
});

test('SAST fails on findings with a digest-pinned image', () => {
  assert.match(scan, / --error( |$)/);
  assert.match(workflow, /semgrep\/semgrep:[0-9.]+@sha256:[0-9a-f]{64} \\\n +semgrep scan /);
});
