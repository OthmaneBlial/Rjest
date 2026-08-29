import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repository = resolve(fileURLToPath(new URL('..', import.meta.url)));
const rjest = join(repository, 'target', 'debug', 'rjest');
const jest = join(repository, 'node_modules', 'jest', 'bin', 'jest.js');
const fixtures = join(repository, 'compat', 'fixtures');

const cases = [
  {name: 'core-pass', expectedExit: 0},
  {name: 'failure', expectedExit: 1},
  {name: 'focus', expectedExit: 0},
  {name: 'timeout', expectedExit: 1},
];

for (const testCase of cases) {
  compareCase(testCase);
}
console.log(`Compatibility: ${cases.length}/${cases.length} differential scenarios passed`);

function compareCase(testCase) {
  const fixture = join(fixtures, testCase.name);
  const temporary = mkdtempSync(join(tmpdir(), 'rjest-compat-'));
  const jestOutput = join(temporary, 'jest-result.json');
  try {
    const jestRun = spawnSync(
      process.execPath,
      [
        jest,
        '--runInBand',
        '--json',
        `--outputFile=${jestOutput}`,
        `--config=${JSON.stringify({
          rootDir: fixture,
          testEnvironment: 'node',
          transform: {
            '^.+\\.tsx?$': [
              'babel-jest',
              {presets: ['@babel/preset-typescript']},
            ],
          },
        })}`,
      ],
      {cwd: fixture, encoding: 'utf8'},
    );
    assertSpawned(jestRun, `Jest (${testCase.name})`);

    const rjestRun = spawnSync(rjest, ['--runInBand', '--json'], {
      cwd: fixture,
      encoding: 'utf8',
    });
    assertSpawned(rjestRun, `Rjest (${testCase.name})`);

    if (jestRun.status !== testCase.expectedExit) {
      fail(`${testCase.name}: Jest exit ${jestRun.status}, expected ${testCase.expectedExit}`, jestRun);
    }
    if (rjestRun.status !== jestRun.status) {
      fail(`${testCase.name}: exit mismatch Jest=${jestRun.status} Rjest=${rjestRun.status}`, rjestRun);
    }

    const jestResult = normalizeJest(JSON.parse(readFileSync(jestOutput, 'utf8')));
    const rjestResult = normalizeRjest(JSON.parse(rjestRun.stdout));
    if (JSON.stringify(jestResult) !== JSON.stringify(rjestResult)) {
      console.error(`Differential mismatch for ${testCase.name}`);
      console.error('Jest:', JSON.stringify(jestResult, null, 2));
      console.error('Rjest:', JSON.stringify(rjestResult, null, 2));
      process.exit(1);
    }
  } finally {
    rmSync(temporary, {recursive: true, force: true});
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
