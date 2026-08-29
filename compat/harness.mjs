import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
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

const cases = [
  {name: 'config-mjs', expectedExit: 0, useFixtureConfig: true},
  {name: 'config-cjs', expectedExit: 0, useFixtureConfig: true},
  {name: 'config-ts', expectedExit: 0, useFixtureConfig: true},
  {name: 'config-package', expectedExit: 0, useFixtureConfig: true},
  {name: 'core-pass', expectedExit: 0},
  {name: 'failure', expectedExit: 1},
  {name: 'focus', expectedExit: 0},
  {name: 'resolution-cjs', expectedExit: 0},
  {name: 'resolution-esm', expectedExit: 0, experimentalVmModules: true},
  {
    name: 'resolution-node-package',
    expectedExit: 0,
    prepareNodeModules: true,
  },
  {name: 'timeout', expectedExit: 1},
  {name: 'snapshot', expectedExit: 0, compareSnapshots: true},
  {name: 'snapshot-new', expectedExit: 0, compareSnapshots: true},
  {
    name: 'snapshot-update',
    label: 'snapshot-mismatch',
    expectedExit: 1,
    compareSnapshots: true,
  },
  {
    name: 'snapshot-update',
    label: 'snapshot-update',
    expectedExit: 0,
    compareSnapshots: true,
    updateSnapshots: true,
  },
];

for (const testCase of cases) {
  compareCase(testCase);
}
console.log(`Compatibility: ${cases.length}/${cases.length} differential scenarios passed`);

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
    if (rjestRun.status !== jestRun.status) {
      fail(`${label}: exit mismatch Jest=${jestRun.status} Rjest=${rjestRun.status}`, rjestRun);
    }

    const jestResult = normalizeJest(JSON.parse(readFileSync(jestOutput, 'utf8')));
    const rjestResult = normalizeRjest(JSON.parse(rjestRun.stdout));
    if (JSON.stringify(jestResult) !== JSON.stringify(rjestResult)) {
      console.error(`Differential mismatch for ${label}`);
      console.error('Jest:', JSON.stringify(jestResult, null, 2));
      console.error('Rjest:', JSON.stringify(rjestResult, null, 2));
      process.exit(1);
    }
    if (testCase.compareSnapshots) {
      compareSnapshotTrees(label, jestFixture, rjestFixture);
    }
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

function compareSnapshotTrees(name, jestFixture, rjestFixture) {
  const jestSnapshots = readSnapshots(jestFixture);
  const rjestSnapshots = readSnapshots(rjestFixture);
  if (JSON.stringify(jestSnapshots) !== JSON.stringify(rjestSnapshots)) {
    console.error(`Snapshot file mismatch for ${name}`);
    console.error('Jest:', JSON.stringify(jestSnapshots, null, 2));
    console.error('Rjest:', JSON.stringify(rjestSnapshots, null, 2));
    process.exit(1);
  }
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
