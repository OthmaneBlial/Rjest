import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const repository = resolve(fileURLToPath(new URL('..', import.meta.url)));
const rjest = join(repository, 'target', 'debug', 'rjest');
const jest = join(repository, 'node_modules', 'jest', 'bin', 'jest.js');
const fixtures = join(repository, 'compat', 'fixtures');
const require = createRequire(import.meta.url);
const typescriptPreset = require.resolve('@babel/preset-typescript');
const reportPath = join(repository, 'compat', 'jest-compatibility.json');

const cases = [
  {name: 'config-mjs', category: 'Configuration', expectedExit: 0, useFixtureConfig: true},
  {name: 'config-cjs', category: 'Configuration', expectedExit: 0, useFixtureConfig: true},
  {name: 'config-ts', category: 'Configuration', expectedExit: 0, useFixtureConfig: true},
  {name: 'config-package', category: 'Configuration', expectedExit: 0, useFixtureConfig: true},
  {name: 'core-pass', category: 'Core API', expectedExit: 0},
  {name: 'equality-edge', category: 'Expect', expectedExit: 0},
  {name: 'failure', category: 'Core API', expectedExit: 1},
  {name: 'focus', category: 'Core API', expectedExit: 0},
  {name: 'module-mock-cjs', category: 'Mocks', expectedExit: 0},
  {name: 'resolution-cjs', category: 'Resolution', expectedExit: 0},
  {name: 'resolution-esm', category: 'ESM', expectedExit: 0, experimentalVmModules: true},
  {
    name: 'resolution-node-package',
    category: 'Resolution',
    expectedExit: 0,
    prepareNodeModules: true,
  },
  {name: 'timeout', category: 'Core API', expectedExit: 1},
  {name: 'snapshot', category: 'Snapshots', expectedExit: 0, compareSnapshots: true},
  {name: 'snapshot-new', category: 'Snapshots', expectedExit: 0, compareSnapshots: true},
  {
    name: 'snapshot-update',
    label: 'snapshot-mismatch',
    category: 'Snapshots',
    expectedExit: 1,
    compareSnapshots: true,
  },
  {
    name: 'snapshot-update',
    label: 'snapshot-update',
    category: 'Snapshots',
    expectedExit: 0,
    compareSnapshots: true,
    updateSnapshots: true,
  },
  {name: 'gap-custom-matcher', category: 'Expect', expectedExit: 0},
  {name: 'gap-fake-timers', category: 'Fake timers', expectedExit: 0, compatible: false},
  {name: 'gap-inline-snapshot', category: 'Snapshots', expectedExit: 0, compatible: false},
  {name: 'gap-automock', category: 'Mocks', expectedExit: 0, compatible: false},
  {
    name: 'gap-module-name-mapper',
    category: 'Configuration',
    expectedExit: 0,
    compatible: false,
    useFixtureConfig: true,
  },
  {name: 'gap-snapshot-property', category: 'Snapshots', expectedExit: 0, compatible: false},
  {name: 'gap-typescript-enum', category: 'Transforms', expectedExit: 0, compatible: false},
];

const outcomes = cases.map(compareCase);
writeCompatibilityReport(outcomes);
const passing = outcomes.filter(outcome => outcome.compatible).length;
console.log(`Compatibility: ${passing}/${cases.length} differential scenarios compatible`);
for (const [category, score] of categoryScores(outcomes)) {
  console.log(`  ${category}: ${score.passing}/${score.total} (${score.percentage.toFixed(1)}%)`);
}

function compareCase(testCase) {
  const label = testCase.label ?? testCase.name;
  const sourceFixture = join(fixtures, testCase.name);
  const temporary = mkdtempSync(join(tmpdir(), 'rjest-compat-'));
  const jestOutput = join(temporary, 'jest-result.json');
  const jestFixture = join(temporary, 'jest');
  const rjestFixture = join(temporary, 'rjest');
  try {
    cpSync(sourceFixture, jestFixture, {recursive: true});
    cpSync(sourceFixture, rjestFixture, {recursive: true});
    if (testCase.prepareNodeModules) {
      prepareNodeModule(jestFixture);
      prepareNodeModule(rjestFixture);
    }
    const jestArguments = [jest, '--runInBand', '--json', `--outputFile=${jestOutput}`];
    if (!testCase.useFixtureConfig) {
      jestArguments.push(`--config=${JSON.stringify({
        rootDir: jestFixture,
        testEnvironment: 'node',
        transform: {
          '^.+\\.tsx?$': [
            'babel-jest',
            {presets: [typescriptPreset]},
          ],
        },
      })}`);
    }
    if (testCase.updateSnapshots) jestArguments.push('--updateSnapshot');
    const jestRun = spawnSync(
      process.execPath,
      jestArguments,
      {
        cwd: jestFixture,
        encoding: 'utf8',
        env: {
          ...process.env,
          CI: '',
          NODE_OPTIONS: testCase.experimentalVmModules
            ? `${process.env.NODE_OPTIONS ?? ''} --experimental-vm-modules`.trim()
            : process.env.NODE_OPTIONS,
        },
      },
    );
    assertSpawned(jestRun, `Jest (${label})`);

    const rjestArguments = ['--runInBand', '--json'];
    if (testCase.updateSnapshots) rjestArguments.push('--updateSnapshot');
    const rjestRun = spawnSync(rjest, rjestArguments, {
      cwd: rjestFixture,
      encoding: 'utf8',
    });
    assertSpawned(rjestRun, `Rjest (${label})`);

    if (jestRun.status !== testCase.expectedExit) {
      fail(`${label}: Jest exit ${jestRun.status}, expected ${testCase.expectedExit}`, jestRun);
    }
    const differences = [];
    if (rjestRun.status !== jestRun.status) {
      differences.push(`exit Jest=${jestRun.status} Rjest=${rjestRun.status}`);
    }

    const jestResult = normalizeJest(JSON.parse(readFileSync(jestOutput, 'utf8')));
    let rjestResult;
    try {
      rjestResult = normalizeRjest(JSON.parse(rjestRun.stdout));
      if (JSON.stringify(jestResult) !== JSON.stringify(rjestResult)) {
        differences.push('test results differ');
      }
    } catch (error) {
      differences.push(`Rjest JSON unavailable: ${error.message}`);
    }
    if (testCase.compareSnapshots) {
      if (!snapshotTreesEqual(jestFixture, rjestFixture)) {
        differences.push('snapshot files differ');
      }
    }

    const compatible = differences.length === 0;
    const expectedCompatibility = testCase.compatible ?? true;
    if (compatible !== expectedCompatibility) {
      if (compatible) {
        fail(
          `${label}: known incompatibility now passes; mark the probe compatible`,
          rjestRun,
        );
      }
      console.error(`Differential mismatch for ${label}: ${differences.join('; ')}`);
      console.error('Jest:', JSON.stringify(jestResult, null, 2));
      if (rjestResult) console.error('Rjest:', JSON.stringify(rjestResult, null, 2));
      fail(`${label}: expected Jest parity`, rjestRun);
    }
    return {
      name: label,
      category: testCase.category,
      compatible,
      differences,
    };
  } finally {
    rmSync(temporary, {recursive: true, force: true});
  }
}

function prepareNodeModule(fixture) {
  cpSync(
    join(fixture, 'dependency-package'),
    join(fixture, 'node_modules', '@rjest-fixture', 'math'),
    {recursive: true},
  );
}

function snapshotTreesEqual(jestFixture, rjestFixture) {
  const jestSnapshots = readSnapshots(jestFixture);
  const rjestSnapshots = readSnapshots(rjestFixture);
  return JSON.stringify(jestSnapshots) === JSON.stringify(rjestSnapshots);
}

function categoryScores(outcomes) {
  const scores = new Map();
  for (const outcome of outcomes) {
    const score = scores.get(outcome.category) ?? {passing: 0, total: 0};
    score.total += 1;
    if (outcome.compatible) score.passing += 1;
    scores.set(outcome.category, score);
  }
  for (const score of scores.values()) {
    score.percentage = (score.passing / score.total) * 100;
  }
  return [...scores.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function writeCompatibilityReport(outcomes) {
  const categories = Object.fromEntries(
    categoryScores(outcomes).map(([category, score]) => [category, score]),
  );
  const passing = outcomes.filter(outcome => outcome.compatible).length;
  const report = {
    $schema: './jest-compatibility.schema.json',
    metric: 'Jest/Rjest parity across the versioned differential scenario corpus',
    limitations:
      'This percentage measures only the scenarios listed below; it is not an exhaustive percentage of the Jest API.',
    score: {
      passing,
      total: outcomes.length,
      percentage: (passing / outcomes.length) * 100,
    },
    categories,
    scenarios: outcomes,
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function readSnapshots(root) {
  if (!existsSync(root)) return [];
  const snapshots = [];
  visit(root, '');
  return snapshots.sort((left, right) => left.path.localeCompare(right.path));

  function visit(directory, relative) {
    for (const name of readdirSync(directory)) {
      const absolute = join(directory, name);
      const child = relative ? `${relative}/${name}` : name;
      if (statSync(absolute).isDirectory()) visit(absolute, child);
      else if (name.endsWith('.snap')) {
        snapshots.push({path: child, contents: readFileSync(absolute, 'utf8')});
      }
    }
  }
}

function normalizeJest(result) {
  return result.testResults
    .flatMap(file =>
      file.assertionResults.map(test => ({
        file: basename(file.name),
        fullName: test.fullName,
        status: normalizeStatus(test.status),
      })),
    )
    .sort(compare);
}

function normalizeRjest(result) {
  return result.testResults
    .flatMap(file =>
      file.tests.map(test => ({
        file: basename(file.testPath),
        fullName: test.fullName,
        status: normalizeStatus(test.status),
      })),
    )
    .sort(compare);
}

function normalizeStatus(status) {
  return status === 'pending' || status === 'disabled' ? 'skipped' : status;
}

function basename(path) {
  return path.replaceAll('\\', '/').split('/').at(-1);
}

function compare(left, right) {
  return `${left.file}\0${left.fullName}`.localeCompare(`${right.file}\0${right.fullName}`);
}

function assertSpawned(result, label) {
  if (result.error) fail(`${label} could not start: ${result.error.message}`, result);
}

function fail(message, result) {
  console.error(message);
  if (result.stdout) console.error(result.stdout);
  if (result.stderr) console.error(result.stderr);
  process.exit(1);
}
