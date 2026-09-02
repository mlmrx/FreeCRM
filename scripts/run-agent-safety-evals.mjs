import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = fileURLToPath(new URL('../fixtures/agent-safety-scenarios.json', import.meta.url));
const vitestPath = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));

const printAndExit = (report, exitCode) => {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(exitCode);
};

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  printAndExit({
    schemaVersion: '1.0',
    suite: 'free-crm-agent-safety',
    evaluationKind: 'deterministic-platform',
    required: true,
    externalExecution: false,
    success: false,
    errors: [`Scenario manifest could not be read: ${error instanceof Error ? error.message : String(error)}`],
    scenarios: [],
  }, 1);
}

const manifestErrors = [];
if (manifest.schemaVersion !== '1.0') manifestErrors.push('Unsupported scenario manifest schemaVersion.');
if (manifest.suite !== 'free-crm-agent-safety') manifestErrors.push('Unexpected scenario suite name.');
if (manifest.evaluationKind !== 'deterministic-platform') manifestErrors.push('Release-gate scenarios must be deterministic platform evaluations.');
if (manifest.required !== true) manifestErrors.push('The platform safety suite must remain required.');
if (manifest.externalExecution !== false) manifestErrors.push('External execution must remain disabled in safety fixtures.');
if (!Array.isArray(manifest.scenarios) || manifest.scenarios.length === 0) manifestErrors.push('At least one required safety scenario is required.');

const scenarioIds = Array.isArray(manifest.scenarios) ? manifest.scenarios.map((scenario) => scenario.id) : [];
if (scenarioIds.some((id) => typeof id !== 'string' || !/^SAF-[A-Z-]+-\d{3}$/.test(id))) manifestErrors.push('Every scenario must have a stable SAF-* identifier.');
if (new Set(scenarioIds).size !== scenarioIds.length) manifestErrors.push('Scenario identifiers must be unique.');

if (manifestErrors.length) {
  printAndExit({
    schemaVersion: manifest.schemaVersion ?? '1.0',
    suite: manifest.suite ?? 'free-crm-agent-safety',
    evaluationKind: manifest.evaluationKind ?? 'deterministic-platform',
    required: true,
    externalExecution: false,
    success: false,
    errors: manifestErrors,
    scenarios: [],
  }, 1);
}

const execution = spawnSync(process.execPath, [
  vitestPath,
  'run',
  'tests/agent-safety-evaluation.test.ts',
  '--reporter=json',
], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  maxBuffer: 10 * 1024 * 1024,
  windowsHide: true,
});

let vitestReport;
try {
  vitestReport = JSON.parse(execution.stdout);
} catch {
  const detail = execution.error?.message
    ?? execution.stderr.trim()
    ?? execution.stdout.trim()
    ?? `Vitest exited with status ${execution.status ?? 'unknown'}.`;
  printAndExit({
    schemaVersion: manifest.schemaVersion,
    suite: manifest.suite,
    evaluationKind: manifest.evaluationKind,
    required: true,
    externalExecution: false,
    success: false,
    errors: [`Safety evaluator did not produce JSON: ${detail}`],
    scenarios: manifest.scenarios.map((scenario) => ({ ...scenario, status: 'not-run', evidence: null, failureMessages: [] })),
  }, 1);
}

const assertions = (vitestReport.testResults ?? []).flatMap((result) => result.assertionResults ?? []);
const taggedAssertions = [];
const untaggedAssertions = [];
for (const assertion of assertions) {
  const evidence = typeof assertion.fullName === 'string' ? assertion.fullName : assertion.title;
  const match = typeof evidence === 'string' ? evidence.match(/\[(SAF-[A-Z-]+-\d{3})\]/) : null;
  if (match) taggedAssertions.push({ ...assertion, scenarioId: match[1], evidence });
  else untaggedAssertions.push(evidence ?? 'unnamed assertion');
}

const contractErrors = [];
if (untaggedAssertions.length) contractErrors.push(`Untagged assertions: ${untaggedAssertions.join(', ')}`);
for (const id of scenarioIds) {
  const count = taggedAssertions.filter((assertion) => assertion.scenarioId === id).length;
  if (count !== 1) contractErrors.push(`Scenario ${id} must have exactly one assertion; found ${count}.`);
}
for (const assertion of taggedAssertions) {
  if (!scenarioIds.includes(assertion.scenarioId)) contractErrors.push(`Test ${assertion.scenarioId} is missing from the scenario manifest.`);
}

const scenarios = manifest.scenarios.map((scenario) => {
  const assertion = taggedAssertions.find((candidate) => candidate.scenarioId === scenario.id);
  return {
    ...scenario,
    status: assertion?.status === 'passed' ? 'passed' : assertion ? 'failed' : 'not-run',
    evidence: assertion?.evidence ?? null,
    failureMessages: assertion?.failureMessages ?? [],
  };
});
const passed = scenarios.filter((scenario) => scenario.status === 'passed').length;
const failed = scenarios.filter((scenario) => scenario.status === 'failed').length;
const notRun = scenarios.filter((scenario) => scenario.status === 'not-run').length;
const success = execution.status === 0 && vitestReport.success === true && contractErrors.length === 0 && passed === scenarios.length;

printAndExit({
  schemaVersion: manifest.schemaVersion,
  suite: manifest.suite,
  evaluationKind: manifest.evaluationKind,
  required: true,
  externalExecution: false,
  modelQualityEvaluations: manifest.modelQualityEvaluations,
  success,
  summary: { total: scenarios.length, passed, failed, notRun },
  errors: contractErrors,
  scenarios,
}, success ? 0 : 1);
