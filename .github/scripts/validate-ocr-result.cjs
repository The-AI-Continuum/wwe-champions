// Copy to .github/scripts/validate-ocr-result.cjs with the canonical workflows.
// Pure validation is shared by the producer and trusted default-branch verifier.
const crypto = require('node:crypto');

// OCR's own built-in file filter, copied from alibaba/open-code-review at the commit ci.yml pins:
// internal/config/allowlist/{supported_file_types,default_exclude_patterns}.json, applied as in
// internal/agent/selection.go (whyExcluded). A file with an extension outside the supported list,
// or a path matching a default exclude (tests, fixtures, generated code, vendored deps, lockfiles),
// is never reviewed by OCR; PR-Agent still reviews it. Any other changed file OCR did not select
// means a rule (possibly one the PR itself changed) hid it from review, so the result must block.
// Update both lists, and OCR_PINNED_COMMIT, whenever ci.yml moves to a new OCR commit.
const OCR_PINNED_COMMIT = '182898cf522da3d04157b422752d028417974e19';
const OCR_SUPPORTED_EXTENSIONS = new Set([
  ".java", ".kt", ".kts", ".scala", ".groovy", ".py", ".pyi", ".js", ".jsx", ".ts", ".tsx", ".mjs",
  ".cjs", ".c", ".h", ".cpp", ".cc", ".cxx", ".hpp", ".hxx", ".cs", ".vb", ".fs", ".fsi", ".fsx",
  ".go", ".rs", ".rb", ".rake", ".gemspec", ".php", ".phtml", ".swift", ".m", ".mm", ".sh", ".bash",
  ".zsh", ".fish", ".ps1", ".sql", ".css", ".scss", ".sass", ".less", ".html", ".htm", ".ftl",
  ".ftlh", ".ftlx", ".hbs", ".mustache", ".jinja2", ".j2", ".pug", ".astro", ".vue", ".ipynb",
  ".svelte", ".xml", ".yaml", ".yml", ".json", ".toml", ".ini", ".env", ".gradle", ".cmake", ".r",
  ".lua", ".pl", ".pm", ".ex", ".exs", ".erl", ".hrl", ".ets", ".json5", ".dart", ".tf", ".graphql",
  ".gql", ".prisma", ".jl", ".hcl", ".tfvars", ".bicep", ".proto", ".nix", ".hs", ".lhs", ".nim",
  ".nims", ".nimble", ".elm", ".properties", ".po", ".pot", ".jsonnet", ".libsonnet", ".zig",
  ".thrift", ".capnp", ".ml", ".mli", ".re", ".rei", ".v", ".sv", ".vh", ".vhd", ".vhdl", ".sol",
  ".vy", ".rego",
]);
const OCR_DEFAULT_EXCLUDES = [
  "**/*_test.go", "**/src/test/java/**/*.java", "**/src/test/**/*.{kt,kts}", "**/*Test.fs",
  "**/*.test.{js,jsx,ts,tsx}", "**/*.spec.{js,jsx,ts,tsx}", "**/__tests__/**",
  "**/test/**/*_test.py", "**/tests/**/*_test.py", "**/*_test.py", "**/test_*.py", "**/*_spec.rb",
  "**/spec/**/*_spec.rb", "**/*Test.java", "**/*Tests.java", "**/*_test.rs", "**/oh_modules/**",
  "**/*.test.ets", "**/test/**/*.jl", "**/test/**/*.hs", "**/*Spec.hs", "**/test/**/*.lhs",
  "**/*Spec.lhs", "**/tests/**/*.nim", "**/tests/**/*.R", "**/__snapshots__/**", "**/*.snap",
  "**/testdata/**", "**/fixtures/**", "**/.ipynb_checkpoints/**", "**/*.generated.*", "**/*.gen.go",
  "**/*.pb.go", "**/*.pb.cc", "**/*.pb.h", "**/*Test.swift", "**/*Tests.swift",
  "**/Tests/**/*.swift", "**/tests/**/*.elm", "**/test/**/*.zig", "**/*_test.zig",
  "**/kitex_gen/**/*.go", "**/*.capnp.h", "**/*.capnp.go", "**/*.capnp.ts", "**/*_capnp.rs",
  "**/*_capnp.py", "**/test/**/*.ml", "**/tb_*.{v,sv,vhd,vhdl}", "**/*_tb.{v,sv,vhd,vhdl}",
  "lib/**/*.sol", "**/*.t.sol", "**/test/**/*.sol", "**/tests/**/*.sol", "**/test/**/*.vy",
  "**/tests/**/*.vy", "**/node_modules/**", "**/bower_components/**", "**/.pnpm-store/**",
  "**/.yarn/{cache,unplugged,releases,sdks,patches}/**", "**/.pnp.cjs", "**/.pnp.loader.mjs",
  "**/package-lock.json", "**/pnpm-lock.yaml", "**/npm-shrinkwrap.json", "**/*.min.{js,css}",
  "**/dist/**", "**/.next/**", "**/.nuxt/**", "**/.svelte-kit/**", "**/.astro/**", "**/.turbo/**",
  "**/.angular/**", "**/.parcel-cache/**", "**/.docusaurus/**", "**/vendor/**", "**/.bundle/**",
  "**/target/**", "**/.gradle/**", "**/__pycache__/**", "**/.venv/**", "**/venv/**",
  "**/site-packages/**", "**/*.egg-info/**", "**/.tox/**", "**/.mypy_cache/**",
  "**/.pytest_cache/**", "**/.ruff_cache/**", "**/Pods/**", "**/Carthage/**", "**/.build/**",
  "**/obj/**", "**/.dart_tool/**", "**/.terraform/**", "**/.terraform.lock.hcl",
  "**/.stack-work/**", "**/coverage/lcov-report/**",
];

// Minimal doublestar glob (the subset OCR's patterns use: **, *, ?, {a,b}), lower-cased like OCR.
const expandBraces = glob => {
  const m = glob.match(/\{([^{}]*)\}/);
  return m ? m[1].split(',').flatMap(alt => expandBraces(glob.slice(0, m.index) + alt + glob.slice(m.index + m[0].length))) : [glob];
};
const globToRegExp = glob => new RegExp('^' + glob.split(/(\*\*\/|\/\*\*$|\*\*|\*|\?)/).map(part =>
  part === '**/' ? '(?:.*/)?' : part === '/**' ? '(?:/.*)?' : part === '**' ? '.*' : part === '*' ? '[^/]*' :
  part === '?' ? '[^/]' : part.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('') + '$');
const OCR_EXCLUDE_REGEXPS = OCR_DEFAULT_EXCLUDES.flatMap(expandBraces).map(glob => globToRegExp(glob.toLowerCase()));

const isUnreviewablePath = path => {
  const lower = path.toLowerCase();
  const base = lower.slice(lower.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  if (dot > 0 && !OCR_SUPPORTED_EXTENSIONS.has(base.slice(dot))) return true; // OCR: ExcludeExtension
  return OCR_EXCLUDE_REGEXPS.some(re => re.test(lower)); // OCR: ExcludeDefaultPath
};

// changedFiles: the PR's non-deleted paths. Every one must be selected by OCR or be a file
// OCR's built-in filter never reviews. fail() messages are fixed strings: never interpolate result values.
function validateOcrResult(result, expectedHead, changedFiles) {
  const fail = message => { throw new Error(`OCR: ${message}`); };
  if (!/^[a-f0-9]{40}$/i.test(expectedHead || '')) fail('expected PR head is invalid');
  const manifest = result?.manifest;
  const skipped = result?.status === 'skipped';
  const state = skipped ? 'skipped' : 'complete';
  if (result?.status !== state || manifest?.terminal_state !== state ||
      manifest?.schema_version !== 'ocr.run-manifest/v1' || manifest?.operation !== 'review') {
    fail('review and manifest must both be complete, or both skipped');
  }
  if (manifest.input?.resolved_head !== expectedHead) fail('reviewed SHA does not match the current PR head');
  if (result.llm?.model !== 'qwen/qwen3-coder-flash' || manifest.execution?.model !== result.llm.model) {
    fail('effective review model is not the pinned Qwen model');
  }
  const coverage = manifest.coverage;
  if (!coverage || ['selected', 'completed', 'reused', 'failed', 'waived'].some(key => !Array.isArray(coverage[key]))) {
    fail('coverage arrays are missing or malformed');
  }
  if (coverage.failed.length || coverage.waived.length) fail('selected coverage has failed or waived items');
  const identities = items => {
    const map = new Map();
    for (const item of items) {
      if (typeof item?.item_id !== 'string' || !item.item_id || typeof item.path !== 'string' || !item.path ||
          !/^[a-f0-9]{64}$/i.test(item.fingerprint || '') || map.has(item.item_id)) fail('coverage identities are invalid or duplicated');
      map.set(item.item_id, item);
    }
    return map;
  };
  const selected = identities(coverage.selected);
  if (skipped && selected.size) fail('a skipped review must not select files');
  const selectedPaths = new Set([...selected.values()].map(item => item.path));
  if (!Array.isArray(changedFiles) || changedFiles.some(path => typeof path !== 'string' ||
      (!selectedPaths.has(path) && !isUnreviewablePath(path)))) {
    fail('a changed file that OCR can review was not selected for review');
  }
  const finished = identities([...coverage.completed, ...coverage.reused]);
  if (finished.size !== selected.size || [...selected].some(([id, item]) =>
    finished.get(id)?.path !== item.path || finished.get(id)?.fingerprint !== item.fingerprint)) {
    fail('every selected file must have matching completed or reused coverage');
  }
  const warnings = result.warnings ?? [];
  if (!Array.isArray(warnings) || warnings.some(warning => !warning || typeof warning.type !== 'string' || warning.type === 'review_round_failed')) {
    fail('review warnings are malformed or a requested review round failed');
  }
  return { status: 'complete', skipped, headSha: expectedHead, model: result.llm.model, selectedFiles: selected.size };
}

async function resolveOcrArtifact(github, repo, headSha, checkName = 'Code review (OCR)') {
  const fail = message => { throw new Error(`OCR: ${message}`); };
  if (!/^[a-f0-9]{40}$/i.test(headSha || '')) fail('expected PR head is invalid');
  const checks = await github.paginate(github.rest.checks.listForRef, { ...repo, ref: headSha, per_page: 100 });
  const check = checks.filter(value => value.name === checkName).sort((a, b) => b.id - a.id)[0];
  if (!check || check.app?.slug !== 'github-actions' || check.status !== 'completed' || check.conclusion !== 'success') {
    fail('latest OCR check is not a successful GitHub Actions check');
  }
  let url;
  try { url = new URL(check.details_url); } catch { fail('check has no valid workflow job URL'); }
  const server = new URL(process.env.GITHUB_SERVER_URL || 'https://github.com');
  const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/actions\/runs\/(\d+)\/job\/(\d+)$/);
  if (url.origin !== server.origin || !match || match[1] !== repo.owner || match[2] !== repo.repo) fail('check URL does not belong to this repository');
  const runId = Number(match[3]), jobId = Number(match[4]);
  const { data: job } = await github.rest.actions.getJobForWorkflowRun({ ...repo, job_id: jobId });
  if (job.run_id !== runId || job.head_sha !== headSha || !Number.isSafeInteger(job.run_attempt) || job.run_attempt < 1 ||
      job.name !== checkName || job.status !== 'completed' || job.conclusion !== 'success') fail('workflow job identity, attempt or SHA is invalid');
  const artifactName = `ocr-review-result-${runId}-${job.run_attempt}`;
  const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, { ...repo, run_id: runId, per_page: 100 });
  const matches = artifacts.filter(value => value.name === artifactName && value.expired === false);
  if (matches.length !== 1) fail('latest-attempt raw review artifact is missing, expired or ambiguous');
  return { runId, attempt: job.run_attempt, artifactName, headSha, artifactId: matches[0].id, checkId: check.id, jobId };
}

module.exports = { validateOcrResult, resolveOcrArtifact, isUnreviewablePath, OCR_PINNED_COMMIT };

if (require.main === module) {
  try {
    const fs = require('node:fs');
    const [file, head, sourceFile] = process.argv.slice(2);
    const raw = fs.readFileSync(file, 'utf8');
    // Optional newline-separated list of the PR's non-deleted paths (OCR_CHANGED_FILES).
    const listFile = process.env.OCR_CHANGED_FILES;
    const changed = listFile ? fs.readFileSync(listFile, 'utf8').split('\n').filter(Boolean) : undefined;
    const evidence = validateOcrResult(JSON.parse(raw), head, changed);
    evidence.contentSha256 = crypto.createHash('sha256').update(raw).digest('hex');
    if (sourceFile) evidence.source = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } catch (error) {
    // Only print our own "OCR:" messages; parse errors can echo untrusted review text.
    const reason = /^OCR: [^\n]{1,200}$/.test(error?.message || '') ? ` ${error.message}` : '';
    console.error(`::error::OCR evidence is missing, malformed, stale or incomplete.${reason}`);
    process.exitCode = 1;
  }
}
