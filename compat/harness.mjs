import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
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
const prettierPath = require.resolve('prettier');
const prettierV2Path = require.resolve('prettier-v2');
const yarnPath = require.resolve('@yarnpkg/cli-dist/bin/yarn.js');
const reportPath = join(repository, 'compat', 'jest-compatibility.json');

const cases = [
  {name: 'config-mjs', category: 'Configuration', expectedExit: 0, useFixtureConfig: true},
  {
    name: 'config-silent',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {name: 'config-cjs', category: 'Configuration', expectedExit: 0, useFixtureConfig: true},
  {name: 'config-ts', category: 'Configuration', expectedExit: 0, useFixtureConfig: true},
  {
    name: 'config-ts-esm-native',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'config-ts-import',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {name: 'config-package', category: 'Configuration', expectedExit: 0, useFixtureConfig: true},
  {
    name: 'config-test-regex',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'config-bail-threshold',
    category: 'Configuration',
    expectedExit: 1,
    useFixtureConfig: true,
    compareExecutionMarkers: true,
  },
  {
    name: 'config-projects-inline',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'config-projects-rootdir-cli-path',
    category: 'Configuration',
    expectedExit: 0,
    testPathPatterns: ['src/nested.test.cjs'],
    useFixtureConfig: true,
  },
  {
    name: 'config-preset',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'config-rootdir-test-match',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'config-parent-traversal',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
    workingDirectory: 'packages/example',
  },
  {
    name: 'config-parent-package-root',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
    workingDirectory: 'packages/example',
  },
  {
    name: 'config-parent-package-boundary',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
    workingDirectory: 'packages/example',
  },
  {
    name: 'config-setup-files',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'config-fake-timers-legacy',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'config-fake-timers-modern',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'config-fake-timers-advance',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'coverage-basic',
    category: 'Coverage',
    expectedExit: 0,
    coverage: true,
    compareCoverage: true,
    collectCoverageFrom: ['**/*.js', '!**/*.test.js'],
    rjestMaxWorkers: 2,
  },
  {
    name: 'coverage-threshold',
    category: 'Coverage',
    expectedExit: 1,
    compareCoverage: true,
    useFixtureConfig: true,
  },
  {
    name: 'coverage-post-transform',
    category: 'Coverage',
    expectedExit: 0,
    coverage: true,
    compareCoverage: true,
    useFixtureConfig: true,
  },
  {name: 'core-pass', category: 'Core API', expectedExit: 0},
  {name: 'core-test-failing-pass', category: 'Core API', expectedExit: 0},
  {name: 'core-test-failing-failure', category: 'Core API', expectedExit: 1},
  {name: 'core-each-name', category: 'Core API', expectedExit: 0},
  {name: 'equality-edge', category: 'Expect', expectedExit: 0},
  {
    name: 'environment-node-env',
    category: 'Environment',
    expectedExit: 0,
    unsetNodeEnv: true,
  },
  {
    name: 'environment-jsdom-globals',
    category: 'Environment',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'environment-docblock',
    category: 'Environment',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'environment-jsdom-global-date',
    category: 'Environment',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'environment-worker-exec-argv',
    category: 'Environment',
    expectedExit: 0,
  },
  {
    name: 'environment-custom',
    category: 'Environment',
    compareArtifacts: ['environment-events.json'],
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'environment-custom-jsdom-esm',
    category: 'Environment',
    compareArtifacts: ['environment-teardown.json'],
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {name: 'failure', category: 'Core API', expectedExit: 1},
  {name: 'fake-timers-clock', category: 'Fake timers', expectedExit: 0},
  {
    name: 'fake-timers-date-marker',
    category: 'Fake timers',
    expectedExit: 0,
  },
  {name: 'fake-timers-legacy', category: 'Fake timers', expectedExit: 0},
  {
    name: 'fake-timers-legacy-jsdom',
    category: 'Fake timers',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {name: 'fake-timers-queues', category: 'Fake timers', expectedExit: 0},
  {name: 'focus', category: 'Core API', expectedExit: 0},
  {name: 'gap-process-stdout', category: 'Core API', expectedExit: 0},
  {name: 'module-mock-cjs', category: 'Mocks', expectedExit: 0},
  {name: 'mock-reference-semantics', category: 'Mocks', expectedExit: 0},
  {name: 'gap-automock-prototype', category: 'Mocks', expectedExit: 0},
  {name: 'gap-isolate-modules', category: 'Mocks', expectedExit: 0},
  {
    name: 'gap-manual-mock',
    category: 'Mocks',
    expectedExit: 0,
    prepareNodeModules: true,
  },
  {name: 'gap-virtual-mock', category: 'Mocks', expectedExit: 0},
  {name: 'resolution-cjs', category: 'Resolution', expectedExit: 0},
  {
    name: 'resolution-module-sync-condition',
    category: 'Resolution',
    expectedExit: 0,
    prepareNodeModules: true,
    useFixtureConfig: true,
  },
  {
    name: 'resolution-mapped-cjs-js-in-module',
    category: 'Resolution',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'resolution-module-directories',
    category: 'Resolution',
    expectedExit: 0,
    experimentalVmModules: true,
    prepareNodeModules: true,
    useFixtureConfig: true,
  },
  {
    name: 'resolution-esm-extensionless',
    category: 'Resolution',
    expectedExit: 0,
    experimentalVmModules: true,
    useFixtureConfig: true,
  },
  {
    name: 'resolution-pnp',
    category: 'Resolution',
    expectedExit: 0,
    experimentalVmModules: true,
    preparePnp: true,
    useFixtureConfig: true,
  },
  {
    name: 'resolution-module-directories-exclusive',
    category: 'Resolution',
    expectedExit: 0,
    prepareNodeModules: true,
    useFixtureConfig: true,
  },
  {
    name: 'resolution-custom-resolver',
    category: 'Resolution',
    expectedExit: 0,
    experimentalVmModules: true,
    prepareNodeModules: true,
    useFixtureConfig: true,
  },
  {
    name: 'resolution-custom-resolver-esm',
    category: 'Resolution',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'resolution-custom-resolver-async',
    category: 'Resolution',
    expectedExit: 0,
    experimentalVmModules: true,
    prepareNodeModules: true,
    useFixtureConfig: true,
  },
  {
    name: 'resolution-custom-resolver-options',
    category: 'Resolution',
    expectedExit: 0,
    experimentalVmModules: true,
    prepareNodeModules: true,
    useFixtureConfig: true,
  },
  {name: 'resolution-esm', category: 'ESM', expectedExit: 0, experimentalVmModules: true},
  {
    name: 'gap-esm-transform',
    category: 'ESM',
    expectedExit: 0,
    experimentalVmModules: true,
    useFixtureConfig: true,
  },
  {
    name: 'esm-cjs-require-hook',
    category: 'ESM',
    expectedExit: 0,
    experimentalVmModules: true,
    prepareNodeModules: true,
    useFixtureConfig: true,
  },
  {
    name: 'gap-esm-async-mock',
    category: 'ESM',
    expectedExit: 0,
    experimentalVmModules: true,
    prepareNodeModules: true,
  },
  {
    name: 'gap-esm-async-mock-transitive',
    category: 'ESM',
    expectedExit: 0,
    experimentalVmModules: true,
    prepareNodeModules: true,
  },
  {
    name: 'gap-esm-unmock',
    category: 'ESM',
    expectedExit: 0,
    experimentalVmModules: true,
    prepareNodeModules: true,
  },
  {
    name: 'gap-esm-reset-modules',
    category: 'ESM',
    expectedExit: 0,
    experimentalVmModules: true,
  },
  {
    name: 'gap-esm-isolate-modules-async',
    category: 'ESM',
    expectedExit: 0,
    experimentalVmModules: true,
  },
  {
    name: 'gap-esm-automock',
    category: 'Mocks',
    expectedExit: 0,
    experimentalVmModules: true,
    prepareNodeModules: true,
    useFixtureConfig: true,
  },
  {
    name: 'gap-esm-manual-mock',
    category: 'Mocks',
    expectedExit: 0,
    experimentalVmModules: true,
    prepareNodeModules: true,
    useFixtureConfig: true,
  },
  {
    name: 'gap-on-generate-mock',
    category: 'Mocks',
    expectedExit: 0,
    experimentalVmModules: true,
    useFixtureConfig: true,
  },
  {
    name: 'gap-deep-unmock',
    category: 'Mocks',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'gap-replace-property',
    category: 'Mocks',
    expectedExit: 0,
  },
  {
    name: 'config-restore-mocks',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'config-reset-mocks',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'config-reset-modules',
    category: 'Configuration',
    expectedExit: 0,
    experimentalVmModules: true,
    useFixtureConfig: true,
  },
  {
    name: 'config-randomize',
    category: 'Configuration',
    expectedExit: 0,
    seed: 1234,
    useFixtureConfig: true,
  },
  {
    name: 'gap-set-mock',
    category: 'Mocks',
    expectedExit: 0,
  },
  {
    name: 'gap-retry-times',
    category: 'Core API',
    expectedExit: 0,
    compareSnapshots: true,
    compareRetryMetadata: true,
  },
  {
    name: 'gap-retry-entire-describe',
    category: 'Core API',
    expectedExit: 0,
    compareRetryMetadata: true,
    compareSnapshots: true,
  },
  {
    name: 'gap-jest-get-seed',
    category: 'Core API',
    expectedExit: 0,
    seed: -12345,
  },
  {
    name: 'retry-entire-after-all-failure',
    category: 'Core API',
    expectedExit: 1,
    compareRetryMetadata: true,
  },
  {
    name: 'gap-randomize',
    category: 'CLI',
    expectedExit: 0,
    randomize: true,
    seed: 1234,
  },
  {
    name: 'gap-shard',
    label: 'gap-shard-1-of-2',
    category: 'CLI',
    expectedExit: 0,
    shard: '1/2',
  },
  {
    name: 'gap-shard',
    label: 'gap-shard-2-of-2',
    category: 'CLI',
    expectedExit: 0,
    shard: '2/2',
  },
  {
    name: 'gap-shard',
    label: 'gap-shard-1-of-1',
    category: 'CLI',
    expectedExit: 0,
    shard: '1/1',
  },
  {
    name: 'gap-bail',
    category: 'CLI',
    expectedExit: 1,
    bail: true,
    compareExecutionMarkers: true,
  },
  {
    name: 'config-bail-threshold',
    label: 'cli-no-bail-overrides-config',
    category: 'CLI',
    expectedExit: 1,
    useFixtureConfig: true,
    bail: false,
    compareExecutionMarkers: true,
  },
  {
    name: 'retry-before-all-failure',
    category: 'Core API',
    expectedExit: 1,
    compareRetryMetadata: true,
  },
  {
    name: 'resolution-node-package',
    category: 'Resolution',
    expectedExit: 0,
    prepareNodeModules: true,
  },
  {name: 'timeout', category: 'Core API', expectedExit: 1},
  {name: 'snapshot', category: 'Snapshots', expectedExit: 0, compareSnapshots: true},
  {
    name: 'snapshot-serializer-modern',
    category: 'Snapshots',
    expectedExit: 0,
    compareSnapshots: true,
    useFixtureConfig: true,
  },
  {
    name: 'snapshot-format-config',
    category: 'Snapshots',
    compareSnapshots: true,
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'snapshot-mock-function',
    category: 'Snapshots',
    compareSnapshots: true,
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'snapshot-test-failing',
    category: 'Snapshots',
    compareSnapshots: true,
    compareTestSources: true,
    expectedExit: 0,
    updateSnapshots: true,
  },
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
  {
    name: 'expect-custom-equality-testers',
    category: 'Expect',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'expect-custom-matcher-context',
    category: 'Expect',
    expectedExit: 0,
  },
  {
    name: 'expect-package-shared-state',
    category: 'Expect',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {name: 'gap-promise-to-throw', category: 'Expect', expectedExit: 0},
  {name: 'gap-expect-assertions', category: 'Expect', expectedExit: 1},
  {name: 'gap-fake-timers', category: 'Fake timers', expectedExit: 0},
  {name: 'gap-fake-timers-async', category: 'Fake timers', expectedExit: 0},
  {name: 'gap-fake-timers-performance', category: 'Fake timers', expectedExit: 0},
  {name: 'gap-fake-timers-hrtime', category: 'Fake timers', expectedExit: 0},
  {
    name: 'gap-fake-timers-frame',
    category: 'Fake timers',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {name: 'gap-inline-snapshot', category: 'Snapshots', expectedExit: 0},
  {
    name: 'snapshot-inline-write',
    category: 'Snapshots',
    expectedExit: 0,
    updateSnapshots: true,
    compareTestSources: true,
    experimentalVmModules: true,
  },
  {
    name: 'snapshot-inline-prettier',
    label: 'snapshot-inline-prettier-v3',
    category: 'Snapshots',
    expectedExit: 0,
    updateSnapshots: true,
    compareTestSources: true,
    useFixtureConfig: true,
  },
  {
    name: 'snapshot-inline-prettier',
    label: 'snapshot-inline-prettier-v2',
    category: 'Snapshots',
    expectedExit: 0,
    updateSnapshots: true,
    compareTestSources: true,
    useFixtureConfig: true,
    prettierVersion: 2,
  },
  {
    name: 'gap-automock',
    category: 'Mocks',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'gap-module-name-mapper',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'gap-clear-mocks',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'gap-snapshot-property',
    category: 'Snapshots',
    expectedExit: 0,
    compareSnapshots: true,
  },
  {name: 'implicit-babel-transform', category: 'Transforms', expectedExit: 0},
  {
    name: 'transformer-cache-isolation',
    category: 'Transforms',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {name: 'gap-typescript-enum', category: 'Transforms', expectedExit: 0},
  {
    name: 'gap-async-transformer',
    category: 'Transforms',
    expectedExit: 0,
    experimentalVmModules: true,
    useFixtureConfig: true,
  },
  {
    name: 'gap-async-transformer',
    label: 'gap-async-transformer-coverage',
    category: 'Transforms',
    coverage: true,
    compareCoverage: true,
    expectedExit: 0,
    experimentalVmModules: true,
    useFixtureConfig: true,
  },
];

const outcomes = cases.map(compareCase);
writeCompatibilityReport(outcomes);
const passing = outcomes.filter(outcome => outcome.compatible).length;
console.log(`Compatibility: ${passing}/${cases.length} differential scenarios compatible`);
for (const [category, score] of categoryScores(outcomes)) {
  console.log(`  ${category}: ${score.passing}/${score.total} (${score.percentage.toFixed(1)}%)`);
}

function defaultProjectConfig(rootDir) {
  return {
    rootDir: realpathSync(rootDir),
    testEnvironment: 'node',
    transform: {
      '^.+\\.[jt]sx?$': [
        'babel-jest',
        {presets: [[typescriptPreset, {allExtensions: true}]]},
      ],
    },
  };
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
    if (testCase.preparePnp) {
      preparePnpFixture(jestFixture);
      preparePnpFixture(rjestFixture);
    }
    const jestCwd = testCase.workingDirectory
      ? join(jestFixture, testCase.workingDirectory)
      : jestFixture;
    const rjestCwd = testCase.workingDirectory
      ? join(rjestFixture, testCase.workingDirectory)
      : rjestFixture;
    const jestArguments = [jest, '--runInBand'];
    if (testCase.compareExecutionMarkers) jestArguments.push('--no-cache');
    else jestArguments.push('--json', `--outputFile=${jestOutput}`);
    if (!testCase.useFixtureConfig) {
      jestArguments.push(`--config=${JSON.stringify(defaultProjectConfig(jestFixture))}`);
    }
    jestArguments.push(...(testCase.testPathPatterns ?? []));
    if (testCase.updateSnapshots) jestArguments.push('--updateSnapshot');
    if (testCase.seed !== undefined) jestArguments.push(`--seed=${testCase.seed}`);
    if (testCase.randomize) jestArguments.push('--randomize');
    if (testCase.shard) jestArguments.push(`--shard=${testCase.shard}`);
    if (testCase.bail === true) jestArguments.push('--bail');
    if (testCase.bail === false) jestArguments.push('--no-bail');
    if (testCase.coverage) {
      jestArguments.push(
        '--coverage',
        '--coverageReporters=json-summary',
        `--coverageDirectory=${join(jestFixture, '.coverage')}`,
      );
      for (const pattern of testCase.collectCoverageFrom ?? []) {
        jestArguments.push(`--collectCoverageFrom=${pattern}`);
      }
    }
    const jestEnvironment = {
      ...process.env,
      CI: '',
      RJEST_COMPAT_TYPESCRIPT_PRESET: typescriptPreset,
      RJEST_COMPAT_TOOL_NODE_MODULES: join(repository, 'node_modules'),
      RJEST_COMPAT_PRETTIER_PATH:
        testCase.prettierVersion === 2 ? prettierV2Path : prettierPath,
      NODE_OPTIONS: fixtureNodeOptions(testCase, jestFixture),
    };
    if (testCase.unsetNodeEnv) delete jestEnvironment.NODE_ENV;
    const jestRun = spawnSync(
      process.execPath,
      jestArguments,
      {
        cwd: jestCwd,
        encoding: 'utf8',
        env: jestEnvironment,
      },
    );
    assertSpawned(jestRun, `Jest (${label})`);

    const rjestArguments = [
      testCase.rjestMaxWorkers
        ? `--maxWorkers=${testCase.rjestMaxWorkers}`
        : '--runInBand',
    ];
    if (!testCase.compareExecutionMarkers) rjestArguments.push('--json');
    if (!testCase.useFixtureConfig) {
      rjestArguments.push(`--config=${JSON.stringify(defaultProjectConfig(rjestFixture))}`);
    }
    rjestArguments.push(...(testCase.testPathPatterns ?? []));
    if (testCase.updateSnapshots) rjestArguments.push('--updateSnapshot');
    if (testCase.seed !== undefined) rjestArguments.push(`--seed=${testCase.seed}`);
    if (testCase.randomize) rjestArguments.push('--randomize');
    if (testCase.shard) rjestArguments.push(`--shard=${testCase.shard}`);
    if (testCase.bail === true) rjestArguments.push('--bail');
    if (testCase.bail === false) rjestArguments.push('--no-bail');
    if (testCase.coverage) {
      rjestArguments.push(
        '--coverage',
        '--coverageReporters=json-summary',
        `--coverageDirectory=${join(rjestFixture, '.coverage')}`,
      );
      for (const pattern of testCase.collectCoverageFrom ?? []) {
        rjestArguments.push(`--collectCoverageFrom=${pattern}`);
      }
    }
    const rjestEnvironment = {
      ...process.env,
      NODE_PATH: join(repository, 'node_modules'),
      NODE_OPTIONS: fixtureNodeOptions(testCase, rjestFixture),
      RJEST_COMPAT_TYPESCRIPT_PRESET: typescriptPreset,
      RJEST_COMPAT_TOOL_NODE_MODULES: join(repository, 'node_modules'),
      RJEST_COMPAT_PRETTIER_PATH:
        testCase.prettierVersion === 2 ? prettierV2Path : prettierPath,
    };
    if (testCase.unsetNodeEnv) delete rjestEnvironment.NODE_ENV;
    const rjestRun = spawnSync(rjest, rjestArguments, {
      cwd: rjestCwd,
      encoding: 'utf8',
      env: rjestEnvironment,
    });
    assertSpawned(rjestRun, `Rjest (${label})`);

    if (jestRun.status !== testCase.expectedExit) {
      fail(`${label}: Jest exit ${jestRun.status}, expected ${testCase.expectedExit}`, jestRun);
    }
    const differences = [];
    if (rjestRun.status !== jestRun.status) {
      differences.push(`exit Jest=${jestRun.status} Rjest=${rjestRun.status}`);
    }

    let jestResult;
    let rjestResult;
    if (testCase.compareExecutionMarkers) {
      jestResult = {executionMarkers: readExecutionMarkers(jestFixture)};
      rjestResult = {executionMarkers: readExecutionMarkers(rjestFixture)};
      if (JSON.stringify(jestResult) !== JSON.stringify(rjestResult)) {
        differences.push('executed test files differ');
      }
    } else {
      jestResult = normalizeJest(
        JSON.parse(readFileSync(jestOutput, 'utf8')),
        testCase,
      );
      try {
        rjestResult = normalizeRjest(JSON.parse(rjestRun.stdout), testCase);
        if (JSON.stringify(jestResult) !== JSON.stringify(rjestResult)) {
          differences.push('test results differ');
        }
      } catch (error) {
        differences.push(`Rjest JSON unavailable: ${error.message}`);
      }
    }
    if (testCase.compareSnapshots) {
      if (!snapshotTreesEqual(jestFixture, rjestFixture)) {
        differences.push('snapshot files differ');
      }
    }
    if (testCase.compareTestSources) {
      const jestSources = readTestSources(jestFixture);
      const rjestSources = readTestSources(rjestFixture);
      if (JSON.stringify(jestSources) !== JSON.stringify(rjestSources)) {
        differences.push('rewritten test sources differ');
      }
    }
    for (const artifact of testCase.compareArtifacts ?? []) {
      const jestArtifact = readOptionalArtifact(jestFixture, artifact);
      const rjestArtifact = readOptionalArtifact(rjestFixture, artifact);
      if (jestArtifact !== rjestArtifact) {
        differences.push(`artifact differs: ${artifact}`);
      }
    }
    if (testCase.compareCoverage) {
      const jestCoverage = normalizeCoverageSummary(
        JSON.parse(readFileSync(join(jestFixture, '.coverage', 'coverage-summary.json'), 'utf8')),
      );
      const rjestCoverage = normalizeCoverageSummary(
        JSON.parse(readFileSync(join(rjestFixture, '.coverage', 'coverage-summary.json'), 'utf8')),
      );
      if (JSON.stringify(jestCoverage) !== JSON.stringify(rjestCoverage)) {
        differences.push('coverage summaries differ');
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

function readOptionalArtifact(fixture, relativePath) {
  const path = join(fixture, relativePath);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

function normalizeCoverageSummary(summary) {
  return canonicalize(Object.fromEntries(
    Object.entries(summary)
      .map(([path, metrics]) => [path === 'total' ? path : basename(path), metrics])
      .sort(([left], [right]) => left.localeCompare(right)),
  ));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

function prepareNodeModule(fixture) {
  cpSync(
    join(fixture, 'dependency-package'),
    join(fixture, 'node_modules', '@rjest-fixture', 'math'),
    {recursive: true},
  );
}

function preparePnpFixture(fixture) {
  const installation = spawnSync(
    process.execPath,
    [yarnPath, 'install', '--immutable'],
    {
      cwd: fixture,
      encoding: 'utf8',
      env: {
        ...process.env,
        YARN_ENABLE_GLOBAL_CACHE: 'false',
        YARN_NODE_LINKER: 'pnp',
      },
    },
  );
  assertSpawned(installation, 'Yarn PnP fixture install');
  if (installation.status !== 0) {
    fail(`Yarn PnP fixture install exited ${installation.status}`, installation);
  }
}

function fixtureNodeOptions(testCase, fixture) {
  return [
    process.env.NODE_OPTIONS,
    testCase.experimentalVmModules ? '--experimental-vm-modules' : undefined,
    testCase.preparePnp ? `--require=${join(fixture, '.pnp.cjs')}` : undefined,
  ]
    .filter(Boolean)
    .join(' ');
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

function readExecutionMarkers(root) {
  return readdirSync(root)
    .filter(name => name.endsWith('.marker'))
    .sort()
    .map(name => ({name, contents: readFileSync(join(root, name), 'utf8')}));
}

function readTestSources(root) {
  const sources = [];
  visit(root, '');
  return sources.sort((left, right) => left.path.localeCompare(right.path));

  function visit(directory, relative) {
    for (const name of readdirSync(directory)) {
      const absolute = join(directory, name);
      const child = relative ? `${relative}/${name}` : name;
      if (statSync(absolute).isDirectory()) visit(absolute, child);
      else if (/\.(?:spec|test)\.[cm]?[jt]sx?$/.test(name)) {
        sources.push({path: child, contents: readFileSync(absolute, 'utf8')});
      }
    }
  }
}

function normalizeJest(result, testCase) {
  return {
    tests: result.testResults
      .flatMap(file =>
        file.assertionResults.map(test => ({
          file: basename(file.name),
          fullName: test.fullName,
          status: normalizeStatus(test.status),
          ...(testCase.compareRetryMetadata
            ? {
                invocations: test.invocations ?? 0,
                retryReasons: test.retryReasons?.length ?? 0,
              }
            : {}),
        })),
      )
      .sort(compare),
    snapshot: {
      added: result.snapshot?.added ?? 0,
      matched: result.snapshot?.matched ?? 0,
      unmatched: result.snapshot?.unmatched ?? 0,
      updated: result.snapshot?.updated ?? 0,
    },
  };
}

function normalizeRjest(result, testCase) {
  const snapshot = {added: 0, matched: 0, unmatched: 0, updated: 0};
  for (const file of result.testResults) {
    for (const key of Object.keys(snapshot)) {
      snapshot[key] += file.snapshot?.[key] ?? 0;
    }
  }
  return {
    tests: result.testResults
      .flatMap(file =>
        file.tests.map(test => ({
          file: basename(file.testPath),
          fullName: test.fullName,
          status: normalizeStatus(test.status),
          ...(testCase.compareRetryMetadata
            ? {
                invocations: test.invocations ?? 0,
                retryReasons: test.retryReasons?.length ?? 0,
              }
            : {}),
        })),
      )
      .sort(compare),
    snapshot,
  };
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
