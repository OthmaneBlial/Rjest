import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const repository = resolve(fileURLToPath(new URL('..', import.meta.url)));
const rjest = join(repository, 'target', 'debug', 'rjest');
const jest = join(repository, 'node_modules', 'jest', 'bin', 'jest.js');
const jest29 = join(repository, 'node_modules', 'jest-29', 'bin', 'jest.js');
const jest30_3 = join(repository, 'node_modules', 'jest-30-3', 'bin', 'jest.js');
const fixtures = join(repository, 'compat', 'fixtures');
const require = createRequire(import.meta.url);
const typescriptPreset = require.resolve('@babel/preset-typescript');
const prettierPath = require.resolve('prettier');
const prettierV2Path = require.resolve('prettier-v2');
const yarnPath = require.resolve('@yarnpkg/cli-dist/bin/yarn.js');
const reportPath = join(repository, 'compat', 'jest-compatibility.json');
const ptyRunner = join(repository, 'compat', 'pty_runner.py');

const cases = [
  {
    name: 'config-mjs',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'config-silent',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'config-cjs',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'config-undefined-values',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'config-ts',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
  },
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
  {
    name: 'config-package',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
  },
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
    name: 'config-projects-path-glob',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'config-projects-cli',
    category: 'CLI',
    expectedExit: 0,
    projects: ['packages/alpha', 'packages/beta/jest.config.cjs'],
    useFixtureConfig: true,
  },
  {
    name: 'config-projects-select',
    category: 'CLI',
    expectedExit: 0,
    fixtureName: 'config-projects-inline',
    selectProjects: ['beta'],
    useFixtureConfig: true,
  },
  {
    name: 'config-projects-ignore',
    category: 'CLI',
    expectedExit: 0,
    fixtureName: 'config-projects-inline',
    ignoreProjects: ['alpha'],
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
    name: 'config-rootdir-ignore-patterns',
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
    name: 'config-runtime-options',
    category: 'Configuration',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'config-pass-with-no-tests',
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
    name: 'config-global-hooks',
    category: 'Configuration',
    compareArtifacts: ['global-hooks.json'],
    expectedExit: 0,
    testPathPatterns: ['passing.test.cjs'],
    useFixtureConfig: true,
  },
  {
    name: 'config-global-hooks-failing-test',
    category: 'Configuration',
    compareArtifacts: ['global-hooks.json'],
    expectedExit: 1,
    fixtureName: 'config-global-hooks',
    testPathPatterns: ['failing.test.cjs'],
    useFixtureConfig: true,
  },
  {
    name: 'config-global-hooks-projects',
    category: 'Configuration',
    compareArtifacts: ['global-hooks-projects.json'],
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'config-global-hooks-project-selection',
    category: 'Configuration',
    compareArtifacts: ['global-hooks-projects.json'],
    expectedExit: 0,
    fixtureName: 'config-global-hooks-projects',
    testPathPatterns: ['packages/alpha'],
    useFixtureConfig: true,
  },
  {
    name: 'config-global-hooks-transform',
    category: 'Configuration',
    compareArtifacts: ['global-hooks-transform.json'],
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'config-global-setup-error',
    category: 'Configuration',
    compareArtifacts: [
      'setup-started.txt',
      'test-should-not-run.txt',
      'teardown-should-not-run.txt',
    ],
    expectedExit: 1,
    skipResultComparison: true,
    useFixtureConfig: true,
  },
  {
    name: 'config-global-teardown-error',
    category: 'Configuration',
    compareArtifacts: ['teardown-started.txt'],
    expectedExit: 1,
    skipResultComparison: true,
    useFixtureConfig: true,
  },
  {
    name: 'config-verbose',
    category: 'Configuration',
    compareArtifacts: ['verbose-config.json'],
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'config-test-results-processor',
    category: 'Configuration',
    compareArtifacts: ['processor-observation.json'],
    compareResultFields: ['processed'],
    expectedExit: 0,
    rjestOutputFile: true,
    rjestResultFormat: 'jest',
    useFixtureConfig: true,
  },
  {
    name: 'config-test-results-processor-esm',
    category: 'Configuration',
    compareArtifacts: ['esm-processor-observation.json'],
    compareResultFields: ['processed'],
    expectedExit: 0,
    rjestResultFormat: 'jest',
    testResultsProcessor: './processor.mjs',
    useFixtureConfig: true,
  },
  {
    name: 'config-test-results-processor-error',
    category: 'Configuration',
    compareArtifacts: ['processor-started.json'],
    expectedExit: 1,
    skipResultComparison: true,
    useFixtureConfig: true,
  },
  {
    name: 'config-test-results-processor-success',
    category: 'Configuration',
    compareResultFields: ['processed', 'success'],
    expectedExit: 1,
    rjestResultFormat: 'jest',
    useFixtureConfig: true,
  },
  {
    name: 'config-test-results-processor-empty',
    category: 'Configuration',
    compareArtifacts: ['empty-processor-observation.json'],
    compareResultFields: ['processed'],
    expectedExit: 0,
    rjestResultFormat: 'jest',
    useFixtureConfig: true,
  },
  {
    name: 'cli-force-exit-no-coverage',
    category: 'CLI',
    compareArtifacts: ['cli-overrides.json'],
    expectedExit: 0,
    forceExit: true,
    noCoverage: true,
    useFixtureConfig: true,
  },
  {
    name: 'reporters-custom-lifecycle',
    category: 'Reporters',
    compareArtifacts: ['reporter-events.json'],
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'reporters-get-last-error',
    category: 'Reporters',
    compareArtifacts: ['reporter-error.json'],
    expectedExit: 1,
    useFixtureConfig: true,
  },
  {
    name: 'reporters-hook-error',
    category: 'Reporters',
    compareArtifacts: ['reporter-started.txt'],
    expectedExit: 1,
    skipResultComparison: true,
    useFixtureConfig: true,
  },
  {
    name: 'reporters-custom-output',
    category: 'Reporters',
    compareOutput: true,
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'reporters-multi-project',
    category: 'Reporters',
    compareArtifacts: ['reporter-projects.json'],
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'reporters-parallel',
    category: 'Reporters',
    compareArtifacts: ['reporter-parallel.json'],
    expectedExit: 0,
    jestMaxWorkers: 2,
    rjestMaxWorkers: 2,
    useFixtureConfig: true,
  },
  {
    name: 'reporters-test-case-streaming',
    category: 'Reporters',
    compareArtifacts: ['reporter-stream.json'],
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
    name: 'coverage-v8-basic',
    category: 'Coverage',
    expectedExit: 0,
    coverage: true,
    coverageProvider: 'v8',
    compareCoverage: true,
    collectCoverageFrom: ['**/*.js', '!**/*.test.js'],
    jestMaxWorkers: 2,
    rjestMaxWorkers: 2,
  },
  {
    name: 'coverage-v8-config',
    fixtureName: 'coverage-v8-basic',
    category: 'Coverage',
    expectedExit: 0,
    compareCoverage: true,
    useFixtureConfig: true,
  },
  {
    name: 'coverage-v8-threshold',
    fixtureName: 'coverage-threshold',
    category: 'Coverage',
    expectedExit: 1,
    coverageProvider: 'v8',
    compareCoverage: true,
    useFixtureConfig: true,
  },
  {
    name: 'coverage-v8-source-map',
    category: 'Coverage',
    expectedExit: 0,
    coverage: true,
    coverageProvider: 'v8',
    compareCoverage: true,
    collectCoverageFrom: ['**/*.ts', '!**/*.test.ts'],
    useFixtureConfig: true,
  },
  {
    name: 'coverage-threshold',
    category: 'Coverage',
    expectedExit: 1,
    compareCoverage: true,
    useFixtureConfig: true,
  },
  {
    name: 'coverage-threshold-path-global',
    fixtureName: 'coverage-threshold-groups',
    category: 'Coverage',
    expectedExit: 0,
    coverage: true,
    compareCoverage: true,
    collectCoverageFrom: ['src/*.js'],
    coverageThreshold: {
      './src/partial.js': {statements: 0},
      global: {statements: 100},
    },
  },
  {
    name: 'coverage-threshold-glob-per-file',
    fixtureName: 'coverage-threshold-groups',
    category: 'Coverage',
    expectedExit: 1,
    coverage: true,
    compareCoverage: true,
    collectCoverageFrom: ['src/*.js'],
    coverageThreshold: {'./src/*.js': {statements: 100}},
    requiredOutputPatterns: ['partial.js'],
  },
  {
    name: 'coverage-threshold-missing-path',
    fixtureName: 'coverage-threshold-groups',
    category: 'Coverage',
    expectedExit: 1,
    coverage: true,
    compareCoverage: true,
    collectCoverageFrom: ['src/*.js'],
    coverageThreshold: {'./src/missing.js': {statements: 0}},
    requiredOutputPatterns: ['Coverage data for ./src/missing.js was not found.'],
  },
  {
    name: 'coverage-threshold-directory-aggregate',
    fixtureName: 'coverage-threshold-groups',
    category: 'Coverage',
    expectedExit: 0,
    coverage: true,
    compareCoverage: true,
    collectCoverageFrom: ['src/*.js'],
    coverageThreshold: {'./src/': {statements: 70}},
  },
  {
    name: 'coverage-threshold-overlap',
    fixtureName: 'coverage-threshold-groups',
    category: 'Coverage',
    expectedExit: 1,
    coverage: true,
    compareCoverage: true,
    collectCoverageFrom: ['src/*.js'],
    coverageThreshold: {
      './src/': {statements: 70},
      './src/partial.js': {statements: 70},
    },
    requiredOutputPatterns: ['"./src/partial.js" threshold (70%)'],
  },
  {
    name: 'coverage-threshold-global-fallback',
    fixtureName: 'coverage-threshold-groups',
    category: 'Coverage',
    expectedExit: 1,
    coverage: true,
    compareCoverage: true,
    collectCoverageFrom: ['src/*.js'],
    coverageThreshold: {
      './src/full.js': {statements: 100},
      './src/partial.js': {statements: 0},
      global: {statements: 75},
    },
    requiredOutputPatterns: ['"global" threshold (75%)'],
  },
  {
    name: 'coverage-threshold-negative-glob',
    fixtureName: 'coverage-threshold-groups',
    category: 'Coverage',
    expectedExit: 1,
    coverage: true,
    compareCoverage: true,
    collectCoverageFrom: ['src/*.js'],
    coverageThreshold: {'./src/*.js': {statements: -1}},
    requiredOutputPatterns: ['Uncovered count for statements (2)', 'partial.js'],
  },
  {
    name: 'coverage-threshold-rootdir-cwd',
    category: 'Coverage',
    expectedExit: 0,
    coverage: true,
    compareCoverage: true,
    collectCoverageFrom: ['src/*.js'],
    coverageThreshold: {
      './project/src/partial.js': {statements: 0},
      global: {statements: 100},
    },
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
  {
    name: 'coverage-projects-global-pattern',
    category: 'Coverage',
    expectedExit: 0,
    coverage: true,
    compareCoverage: true,
    collectCoverageFrom: ['packages/**/*.js', '!**/*.test.js'],
    useFixtureConfig: true,
  },
  {name: 'core-pass', category: 'Core API', expectedExit: 0},
  {name: 'core-test-failing-pass', category: 'Core API', expectedExit: 0},
  {
    name: 'core-concurrent-execution',
    category: 'Core API',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {name: 'core-test-failing-failure', category: 'Core API', expectedExit: 1},
  {
    name: 'runtime-environment-torn-down',
    category: 'Core API',
    compareArtifacts: ['environment-state.json'],
    expectedExit: 0,
    useFixtureConfig: true,
  },
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
  {name: 'mock-with-implementation', category: 'Mocks', expectedExit: 0},
  {name: 'mock-reset-restore-contracts', category: 'Mocks', expectedExit: 0},
  {name: 'mock-module-scoped-jest', category: 'Mocks', expectedExit: 0},
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
  {
    name: 'resolution-esm',
    category: 'ESM',
    expectedExit: 0,
    experimentalVmModules: true,
  },
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
    name: 'config-projects-shard',
    category: 'CLI',
    expectedExit: 0,
    shard: '1/2',
    useFixtureConfig: true,
  },
  {
    name: 'config-projects-bail',
    category: 'CLI',
    expectedExit: 1,
    bail: true,
    compareExecutionMarkers: true,
    useFixtureConfig: true,
  },
  {
    name: 'config-test-sequencer',
    label: 'config-test-sequencer-sort',
    category: 'Configuration',
    expectedExit: 0,
    compareExecutionMarkers: true,
    seed: 17,
    useFixtureConfig: true,
  },
  {
    name: 'config-test-sequencer-custom-resolver',
    category: 'Configuration',
    expectedExit: 0,
    compareExecutionMarkers: true,
    useFixtureConfig: true,
  },
  {
    name: 'config-test-sequencer',
    label: 'config-test-sequencer-shard',
    category: 'CLI',
    expectedExit: 0,
    compareExecutionMarkers: true,
    seed: 17,
    shard: '2/3',
    useFixtureConfig: true,
  },
  {
    name: 'config-test-sequencer',
    label: 'cli-test-sequencer-override',
    category: 'CLI',
    expectedExit: 0,
    compareExecutionMarkers: true,
    seed: 17,
    testSequencer: './ascending-sequencer.cjs',
    useFixtureConfig: true,
  },
  {
    name: 'config-test-sequencer',
    label: 'cli-only-failures-custom-sequencer',
    category: 'CLI',
    expectedExit: 0,
    compareExecutionMarkers: true,
    onlyFailures: true,
    seed: 17,
    useFixtureConfig: true,
  },
  {
    name: 'only-failures-cache',
    category: 'CLI',
    expectedExit: 1,
    compareExecutionMarkers: true,
    onlyFailures: true,
    primeOnlyFailures: true,
    useFixtureConfig: true,
    useJestCache: true,
  },
  {
    name: 'only-failures-cache',
    label: 'cli-only-failures-after-bail',
    category: 'CLI',
    expectedExit: 1,
    compareExecutionMarkers: true,
    onlyFailures: true,
    primeOnlyFailures: true,
    primeWithBail: true,
    useFixtureConfig: true,
    useJestCache: true,
  },
  {
    name: 'only-failures-cache',
    label: 'cli-only-failures-cold-cache',
    category: 'CLI',
    expectedExit: 1,
    compareExecutionMarkers: true,
    onlyFailures: true,
    useFixtureConfig: true,
    useJestCache: true,
  },
  {
    name: 'only-failures-cache',
    label: 'cli-only-failures-retains-skipped-cache',
    category: 'CLI',
    expectedExit: 1,
    compareExecutionMarkers: true,
    onlyFailures: true,
    primeOnlyFailures: true,
    primeThenSkip: true,
    useFixtureConfig: true,
    useJestCache: true,
  },
  {
    name: 'only-failures-file-error',
    category: 'CLI',
    expectedExit: 1,
    compareExecutionMarkers: true,
    onlyFailures: true,
    primeOnlyFailures: true,
    useFixtureConfig: true,
    useJestCache: true,
  },
  {
    name: 'cache-disabled',
    label: 'config-cache-disabled-only-failures',
    category: 'Configuration',
    expectedExit: 1,
    compareExecutionMarkers: true,
    compareNoFailedMessage: true,
    onlyFailures: true,
    primeOnlyFailures: true,
    useFixtureConfig: true,
    useJestCache: true,
  },
  {
    name: 'cache-disabled',
    label: 'cli-cache-enables-config-cache',
    category: 'CLI',
    expectedExit: 1,
    cache: true,
    compareExecutionMarkers: true,
    onlyFailures: true,
    primeOnlyFailures: true,
    useFixtureConfig: true,
    useJestCache: true,
  },
  {
    name: 'only-failures-cache',
    label: 'cli-no-cache-clears-failure-history',
    category: 'CLI',
    expectedExit: 1,
    compareExecutionMarkers: true,
    noCache: true,
    onlyFailures: true,
    primeOnlyFailures: true,
    primeWithCache: true,
    useFixtureConfig: true,
    useJestCache: true,
  },
  {
    name: 'cache-controls',
    label: 'cli-clear-configured-cache',
    category: 'CLI',
    expectedExit: 0,
    clearCache: true,
    compareCacheDirectory: '.cache',
    compareExecutionMarkers: true,
    expectedCacheDirectoryExists: false,
    primeCacheThenClear: true,
    useFixtureConfig: true,
    useJestCache: true,
  },
  {
    name: 'config-test-sequencer-esm',
    category: 'Configuration',
    expectedExit: 0,
    compareExecutionMarkers: true,
    seed: 23,
    useFixtureConfig: true,
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
  {
    name: 'snapshot',
    category: 'Snapshots',
    expectedExit: 0,
    compareSnapshots: true,
  },
  {
    name: 'snapshot-legacy-header',
    category: 'Snapshots',
    expectedExit: 0,
    compareSnapshots: true,
    installedJestPackage: 'jest-29',
    jestExecutable: jest29,
  },
  {
    name: 'snapshot-serializer-modern',
    category: 'Snapshots',
    expectedExit: 0,
    compareSnapshots: true,
    useFixtureConfig: true,
  },
  {
    name: 'snapshot-add-serializer',
    category: 'Snapshots',
    expectedExit: 0,
  },
  {
    name: 'snapshot-format-config',
    category: 'Snapshots',
    compareSnapshots: true,
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'snapshot-installed-jest-formatter',
    category: 'Snapshots',
    expectedExit: 0,
    installedJestPackage: 'jest-30-3',
    jestExecutable: jest30_3,
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
  {
    name: 'snapshot-new',
    category: 'Snapshots',
    expectedExit: 0,
    compareSnapshots: true,
  },
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
    name: 'expect-test-identity-context',
    category: 'Expect',
    expectedExit: 0,
  },
  {
    name: 'expect-call-contracts',
    category: 'Expect',
    expectedExit: 0,
  },
  {
    name: 'expect-package-shared-state',
    category: 'Expect',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'expect-return-matchers',
    category: 'Expect',
    expectedExit: 0,
  },
  {
    name: 'expect-asymmetric-factories',
    category: 'Expect',
    expectedExit: 0,
  },
  {
    name: 'expect-matcher-contracts',
    category: 'Expect',
    expectedExit: 0,
  },
  {
    name: 'expect-mock-matcher-contracts',
    category: 'Expect',
    expectedExit: 0,
  },
  {
    name: 'expect-to-throw-contracts',
    category: 'Expect',
    expectedExit: 0,
  },
  {name: 'gap-promise-to-throw', category: 'Expect', expectedExit: 0},
  {name: 'gap-expect-assertions', category: 'Expect', expectedExit: 1},
  {name: 'gap-fake-timers', category: 'Fake timers', expectedExit: 0},
  {name: 'gap-fake-timers-async', category: 'Fake timers', expectedExit: 0},
  {
    name: 'fake-timers-tick-mode',
    category: 'Fake timers',
    expectedExit: 0,
  },
  {
    name: 'fake-timers-temporal-date',
    category: 'Fake timers',
    expectedExit: 0,
  },
  {
    name: 'fake-timers-real-mode',
    category: 'Fake timers',
    expectedExit: 0,
  },
  {
    name: 'fake-timers-limit',
    category: 'Fake timers',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'fake-timers-modern-handles',
    category: 'Fake timers',
    expectedExit: 0,
  },
  {
    name: 'fake-timers-clear-contracts',
    category: 'Fake timers',
    expectedExit: 0,
  },
  {
    name: 'fake-timers-pending-window',
    category: 'Fake timers',
    expectedExit: 0,
  },
  {
    name: 'fake-timers-delay-contracts',
    category: 'Fake timers',
    expectedExit: 0,
  },
  {
    name: 'gap-fake-timers-performance',
    category: 'Fake timers',
    expectedExit: 0,
  },
  {name: 'gap-fake-timers-hrtime', category: 'Fake timers', expectedExit: 0},
  {
    name: 'gap-fake-timers-frame',
    category: 'Fake timers',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'fake-timers-animation-contracts',
    category: 'Fake timers',
    expectedExit: 0,
    useFixtureConfig: true,
  },
  {
    name: 'fake-timers-microtask-contracts',
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
  {
    name: 'transform-installed-jest-isolation',
    category: 'Transforms',
    contaminateBabelJest: true,
    expectedExit: 0,
    installedJestPackage: 'jest',
    useFixtureConfig: true,
  },
  {
    name: 'transform-pnpm-virtual-hoist',
    category: 'Transforms',
    expectedExit: 0,
    preparePnpmVirtualHoist: true,
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
  {
    name: 'find-related-source',
    fixtureName: 'find-related',
    category: 'CLI',
    expectedExit: 0,
    findRelatedTests: true,
    testPathPatterns: ['a.js'],
    useFixtureConfig: true,
  },
  {
    name: 'find-related-transitive-source',
    fixtureName: 'find-related',
    category: 'CLI',
    expectedExit: 0,
    findRelatedTests: true,
    testPathPatterns: ['wrapper.js'],
    useFixtureConfig: true,
  },
  {
    name: 'find-related-test-path',
    fixtureName: 'find-related',
    category: 'CLI',
    expectedExit: 0,
    findRelatedTests: true,
    testPathPatterns: ['a.test.js'],
    useFixtureConfig: true,
  },
  {
    name: 'find-related-no-tests',
    fixtureName: 'find-related',
    category: 'CLI',
    expectedExit: 1,
    findRelatedTests: true,
    requiredOutputPatterns: ['No tests found'],
    skipResultComparison: true,
    testPathPatterns: ['orphan.js'],
    useFixtureConfig: true,
  },
  {
    name: 'find-related-pass-with-no-tests',
    fixtureName: 'find-related',
    category: 'CLI',
    expectedExit: 0,
    findRelatedTests: true,
    passWithNoTests: true,
    testPathPatterns: ['orphan.js'],
    useFixtureConfig: true,
  },
  {
    name: 'find-related-requires-files',
    fixtureName: 'find-related',
    category: 'CLI',
    expectedExit: 1,
    findRelatedTests: true,
    requiredOutputPatterns: [
      'The --findRelatedTests option requires file paths to be specified.',
    ],
    skipResultComparison: true,
    useFixtureConfig: true,
  },
  {
    name: 'find-related-coverage',
    fixtureName: 'find-related',
    category: 'Coverage',
    compareCoverage: true,
    coverage: true,
    expectedExit: 0,
    findRelatedTests: true,
    testPathPatterns: ['a.js'],
    useFixtureConfig: true,
  },
  {
    name: 'find-related-configured-coverage',
    category: 'Coverage',
    compareCoverage: true,
    coverage: true,
    expectedExit: 0,
    findRelatedTests: true,
    testPathPatterns: ['a.js', 'b.js'],
    useFixtureConfig: true,
  },
  {
    name: 'changed-selection-only-changed',
    fixtureName: 'changed-selection',
    category: 'CLI',
    changedSelectionArgs: ['-o'],
    expectedExit: 0,
    experimentalVmModules: true,
    prepareChangedGit: 'working',
    useFixtureConfig: true,
  },
  {
    name: 'changed-selection-last-commit',
    fixtureName: 'changed-selection',
    category: 'CLI',
    changedSelectionArgs: ['--lastCommit'],
    expectedExit: 0,
    experimentalVmModules: true,
    prepareChangedGit: 'history',
    useFixtureConfig: true,
  },
  {
    name: 'changed-selection-since',
    fixtureName: 'changed-selection',
    category: 'CLI',
    changedSelectionArgs: ['--changedSince=baseline'],
    expectedExit: 0,
    experimentalVmModules: true,
    prepareChangedGit: 'history',
    useFixtureConfig: true,
  },
  {
    name: 'changed-selection-ancestor',
    fixtureName: 'changed-selection',
    category: 'CLI',
    changedSelectionArgs: ['--changedFilesWithAncestor'],
    expectedExit: 0,
    experimentalVmModules: true,
    prepareChangedGit: 'history',
    useFixtureConfig: true,
  },
  {
    name: 'changed-selection-all-override',
    fixtureName: 'changed-selection',
    category: 'CLI',
    changedSelectionArgs: ['--all'],
    expectedExit: 0,
    experimentalVmModules: true,
    prepareChangedGit: 'config-working',
    useFixtureConfig: true,
  },
  {
    name: 'changed-selection-positional-override',
    fixtureName: 'changed-selection',
    category: 'CLI',
    expectedExit: 0,
    experimentalVmModules: true,
    prepareChangedGit: 'config-clean',
    testPathPatterns: ['beta.test.mjs'],
    useFixtureConfig: true,
  },
  {
    name: 'changed-selection-no-scm',
    fixtureName: 'changed-selection',
    category: 'CLI',
    changedSelectionArgs: ['--onlyChanged'],
    expectedExit: 0,
    experimentalVmModules: true,
    useFixtureConfig: true,
  },
  {
    name: 'changed-selection-coverage',
    category: 'Coverage',
    changedSelectionArgs: ['-o'],
    compareCoverage: true,
    coverage: true,
    expectedExit: 0,
    prepareChangedGit: 'coverage-working',
  },
];

const watchCases = [
  {name: 'watch-all-lifecycle', category: 'Watch', mode: 'all'},
  {name: 'watch-related-lifecycle', category: 'Watch', mode: 'related'},
  {
    name: 'watch-related-no-scm',
    fixtureName: 'watch-related-lifecycle',
    category: 'Watch',
    mode: 'related-no-scm',
  },
  {
    name: 'watch-interactive-interruption',
    category: 'Watch',
    mode: 'interactive',
  },
];

const requestedCases = new Set(
  (process.env.RJEST_COMPAT_FILTER ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean),
);
const selectedCases = requestedCases.size
  ? cases.filter(testCase => requestedCases.has(testCase.label ?? testCase.name))
  : cases;
const selectedWatchCases = requestedCases.size
  ? watchCases.filter(testCase => requestedCases.has(testCase.name))
  : watchCases;
if (requestedCases.size && selectedCases.length + selectedWatchCases.length !== requestedCases.size) {
  const selectedNames = new Set([
    ...selectedCases.map(testCase => testCase.label ?? testCase.name),
    ...selectedWatchCases.map(testCase => testCase.name),
  ]);
  const missing = [...requestedCases].filter(name => !selectedNames.has(name));
  throw new Error(`Unknown compatibility filter: ${missing.join(', ')}`);
}

const outcomes = selectedCases.map(compareCase);
for (const watchCase of selectedWatchCases) {
  outcomes.push(await compareWatchCompatibilityCase(watchCase));
}
if (!requestedCases.size) writeCompatibilityReport(outcomes);
const passing = outcomes.filter(outcome => outcome.compatible).length;
console.log(`Compatibility: ${passing}/${outcomes.length} differential scenarios compatible`);
for (const [category, score] of categoryScores(outcomes)) {
  console.log(`  ${category}: ${score.passing}/${score.total} (${score.percentage.toFixed(1)}%)`);
}

function defaultProjectConfig(rootDir) {
  return {
    rootDir: realpathSync(rootDir),
    testEnvironment: 'node',
    transform: {
      '^.+\\.[jt]sx?$': ['babel-jest', {presets: [[typescriptPreset, {allExtensions: true}]]}],
    },
  };
}

function compareCase(testCase) {
  const label = testCase.label ?? testCase.name;
  const sourceFixture = join(fixtures, testCase.fixtureName ?? testCase.name);
  const temporary = mkdtempSync(join(tmpdir(), 'rjest-compat-'));
  const jestOutput = join(temporary, 'jest-result.json');
  const rjestOutput = join(temporary, 'rjest-result.json');
  const jestFixture = join(temporary, 'jest');
  const rjestFixture = join(temporary, 'rjest');
  const contaminatedNodeModules = join(temporary, 'runner-node-modules');
  try {
    cpSync(sourceFixture, jestFixture, {recursive: true});
    cpSync(sourceFixture, rjestFixture, {recursive: true});
    if (testCase.prepareChangedGit) {
      prepareChangedSelectionFixture(
        jestFixture,
        testCase.prepareChangedGit,
        `Jest (${label})`,
      );
      prepareChangedSelectionFixture(
        rjestFixture,
        testCase.prepareChangedGit,
        `Rjest (${label})`,
      );
    }
    if (testCase.prepareNodeModules) {
      prepareNodeModule(jestFixture);
      prepareNodeModule(rjestFixture);
    }
    if (testCase.preparePnp) {
      preparePnpFixture(jestFixture);
      preparePnpFixture(rjestFixture);
    }
    if (testCase.preparePnpmVirtualHoist) {
      preparePnpmVirtualHoist(jestFixture);
      preparePnpmVirtualHoist(rjestFixture);
    }
    if (testCase.installedJestPackage) {
      prepareInstalledJest(jestFixture, testCase.installedJestPackage);
      prepareInstalledJest(rjestFixture, testCase.installedJestPackage);
    }
    if (testCase.contaminateBabelJest) {
      prepareContaminatedBabelJest(contaminatedNodeModules);
    }
    const jestCwd = testCase.workingDirectory
      ? join(jestFixture, testCase.workingDirectory)
      : jestFixture;
    const rjestCwd = testCase.workingDirectory
      ? join(rjestFixture, testCase.workingDirectory)
      : rjestFixture;
    const jestArguments = [
      testCase.jestExecutable ?? jest,
      testCase.jestMaxWorkers ? `--maxWorkers=${testCase.jestMaxWorkers}` : '--runInBand',
    ];
    if (testCase.projects) {
      jestArguments.push('--projects', ...testCase.projects);
    }
    if (testCase.selectProjects) {
      jestArguments.push('--selectProjects', ...testCase.selectProjects);
    }
    if (testCase.ignoreProjects) {
      jestArguments.push('--ignoreProjects', ...testCase.ignoreProjects);
    }
    if (testCase.testSequencer) {
      jestArguments.push(`--testSequencer=${testCase.testSequencer}`);
    }
    if (testCase.testResultsProcessor) {
      jestArguments.push(`--testResultsProcessor=${testCase.testResultsProcessor}`);
    }
    if (!testCase.useJestCache) jestArguments.push('--no-cache');
    if (!testCase.compareExecutionMarkers && !testCase.compareOutput) {
      jestArguments.push('--json', `--outputFile=${jestOutput}`);
    }
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
    if (testCase.cache) jestArguments.push('--cache');
    if (testCase.noCache) jestArguments.push('--no-cache');
    if (testCase.forceExit) jestArguments.push('--forceExit');
    if (testCase.noCoverage) jestArguments.push('--no-coverage');
    if (testCase.clearCache) jestArguments.push('--clearCache');
    if (testCase.onlyFailures) jestArguments.push('--onlyFailures');
    if (testCase.findRelatedTests) jestArguments.push('--findRelatedTests');
    if (testCase.passWithNoTests) jestArguments.push('--passWithNoTests');
    jestArguments.push(...(testCase.changedSelectionArgs ?? []));
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
    if (testCase.coverageProvider) {
      jestArguments.push(`--coverageProvider=${testCase.coverageProvider}`);
    }
    if (testCase.coverageThreshold) {
      jestArguments.push(`--coverageThreshold=${JSON.stringify(testCase.coverageThreshold)}`);
    }
    const jestEnvironment = {
      ...process.env,
      CI: '',
      RJEST_COMPAT_TYPESCRIPT_PRESET: typescriptPreset,
      RJEST_COMPAT_TOOL_NODE_MODULES: join(repository, 'node_modules'),
      RJEST_COMPAT_PRETTIER_PATH: testCase.prettierVersion === 2 ? prettierV2Path : prettierPath,
      NODE_OPTIONS: fixtureNodeOptions(testCase, jestFixture),
    };
    if (testCase.preparePnpmVirtualHoist) {
      jestEnvironment.NODE_PATH = pnpmVirtualHoistPath(jestFixture);
    }
    if (testCase.unsetNodeEnv) delete jestEnvironment.NODE_ENV;
    if (testCase.primeOnlyFailures) {
      const primerArguments = jestArguments.filter(argument => argument !== '--onlyFailures');
      if (testCase.primeWithCache) {
        const noCacheIndex = primerArguments.indexOf('--no-cache');
        if (noCacheIndex >= 0) primerArguments.splice(noCacheIndex, 1);
        primerArguments.push('--cache');
      }
      if (testCase.primeWithBail) primerArguments.push('--bail');
      const primer = spawnSync(process.execPath, primerArguments, {
        cwd: jestCwd,
        encoding: 'utf8',
        env: jestEnvironment,
      });
      assertSpawned(primer, `Jest primer (${label})`);
      if (primer.status !== 1) {
        fail(`${label}: Jest primer exit ${primer.status}, expected 1`, primer);
      }
      removeExecutionMarkers(jestFixture);
      if (testCase.primeThenSkip) {
        const skipPrimer = spawnSync(process.execPath, primerArguments, {
          cwd: jestCwd,
          encoding: 'utf8',
          env: {...jestEnvironment, ONLY_FAILURES_SKIP_PRIMER: '1'},
        });
        assertSpawned(skipPrimer, `Jest skip primer (${label})`);
        if (skipPrimer.status !== 0) {
          fail(`${label}: Jest skip primer exit ${skipPrimer.status}, expected 0`, skipPrimer);
        }
        removeExecutionMarkers(jestFixture);
      }
    }
    if (testCase.primeCacheThenClear) {
      const primerArguments = jestArguments.filter(argument => argument !== '--clearCache');
      const primer = spawnSync(process.execPath, primerArguments, {
        cwd: jestCwd,
        encoding: 'utf8',
        env: jestEnvironment,
      });
      assertSpawned(primer, `Jest cache primer (${label})`);
      if (primer.status !== 1) {
        fail(`${label}: Jest cache primer exit ${primer.status}, expected 1`, primer);
      }
      removeExecutionMarkers(jestFixture);
    }
    const jestRun = spawnSync(process.execPath, jestArguments, {
      cwd: jestCwd,
      encoding: 'utf8',
      env: jestEnvironment,
    });
    assertSpawned(jestRun, `Jest (${label})`);

    const rjestArguments = [
      testCase.rjestMaxWorkers ? `--maxWorkers=${testCase.rjestMaxWorkers}` : '--runInBand',
    ];
    if (testCase.projects) {
      rjestArguments.push('--projects', ...testCase.projects);
    }
    if (testCase.selectProjects) {
      rjestArguments.push('--selectProjects', ...testCase.selectProjects);
    }
    if (testCase.ignoreProjects) {
      rjestArguments.push('--ignoreProjects', ...testCase.ignoreProjects);
    }
    if (testCase.testSequencer) {
      rjestArguments.push(`--testSequencer=${testCase.testSequencer}`);
    }
    if (testCase.testResultsProcessor) {
      rjestArguments.push(`--testResultsProcessor=${testCase.testResultsProcessor}`);
    }
    if (!testCase.useJestCache) rjestArguments.push('--no-cache');
    if (!testCase.compareExecutionMarkers && !testCase.compareOutput) {
      rjestArguments.push('--json');
      if (testCase.rjestOutputFile) {
        rjestArguments.push(`--outputFile=${rjestOutput}`);
      }
    }
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
    if (testCase.cache) rjestArguments.push('--cache');
    if (testCase.noCache) rjestArguments.push('--no-cache');
    if (testCase.forceExit) rjestArguments.push('--forceExit');
    if (testCase.noCoverage) rjestArguments.push('--no-coverage');
    if (testCase.clearCache) rjestArguments.push('--clearCache');
    if (testCase.onlyFailures) rjestArguments.push('--onlyFailures');
    if (testCase.findRelatedTests) rjestArguments.push('--findRelatedTests');
    if (testCase.passWithNoTests) rjestArguments.push('--passWithNoTests');
    rjestArguments.push(...(testCase.changedSelectionArgs ?? []));
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
    if (testCase.coverageProvider) {
      rjestArguments.push(`--coverageProvider=${testCase.coverageProvider}`);
    }
    if (testCase.coverageThreshold) {
      rjestArguments.push(`--coverageThreshold=${JSON.stringify(testCase.coverageThreshold)}`);
    }
    const rjestEnvironment = {
      ...process.env,
      NODE_PATH: testCase.contaminateBabelJest
        ? contaminatedNodeModules
        : join(repository, 'node_modules'),
      NODE_OPTIONS: fixtureNodeOptions(testCase, rjestFixture),
      RJEST_COMPAT_TYPESCRIPT_PRESET: typescriptPreset,
      RJEST_COMPAT_TOOL_NODE_MODULES: join(repository, 'node_modules'),
      RJEST_COMPAT_PRETTIER_PATH: testCase.prettierVersion === 2 ? prettierV2Path : prettierPath,
    };
    if (testCase.unsetNodeEnv) delete rjestEnvironment.NODE_ENV;
    if (testCase.primeOnlyFailures) {
      const primerArguments = rjestArguments.filter(argument => argument !== '--onlyFailures');
      if (testCase.primeWithCache) {
        const noCacheIndex = primerArguments.indexOf('--no-cache');
        if (noCacheIndex >= 0) primerArguments.splice(noCacheIndex, 1);
        primerArguments.push('--cache');
      }
      if (testCase.primeWithBail) primerArguments.push('--bail');
      const primer = spawnSync(rjest, primerArguments, {
        cwd: rjestCwd,
        encoding: 'utf8',
        env: rjestEnvironment,
      });
      assertSpawned(primer, `Rjest primer (${label})`);
      if (primer.status !== 1) {
        fail(`${label}: Rjest primer exit ${primer.status}, expected 1`, primer);
      }
      removeExecutionMarkers(rjestFixture);
      if (testCase.primeThenSkip) {
        const skipPrimer = spawnSync(rjest, primerArguments, {
          cwd: rjestCwd,
          encoding: 'utf8',
          env: {...rjestEnvironment, ONLY_FAILURES_SKIP_PRIMER: '1'},
        });
        assertSpawned(skipPrimer, `Rjest skip primer (${label})`);
        if (skipPrimer.status !== 0) {
          fail(`${label}: Rjest skip primer exit ${skipPrimer.status}, expected 0`, skipPrimer);
        }
        removeExecutionMarkers(rjestFixture);
      }
    }
    if (testCase.primeCacheThenClear) {
      const primerArguments = rjestArguments.filter(argument => argument !== '--clearCache');
      const primer = spawnSync(rjest, primerArguments, {
        cwd: rjestCwd,
        encoding: 'utf8',
        env: rjestEnvironment,
      });
      assertSpawned(primer, `Rjest cache primer (${label})`);
      if (primer.status !== 1) {
        fail(`${label}: Rjest cache primer exit ${primer.status}, expected 1`, primer);
      }
      removeExecutionMarkers(rjestFixture);
    }
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
    for (const expectedMessage of testCase.requiredOutputPatterns ?? []) {
      const jestOutputText = `${jestRun.stdout}\n${jestRun.stderr}`;
      const rjestOutputText = `${rjestRun.stdout}\n${rjestRun.stderr}`;
      if (!jestOutputText.includes(expectedMessage)) {
        fail(`${label}: Jest did not emit ${JSON.stringify(expectedMessage)}`, jestRun);
      }
      if (!rjestOutputText.includes(expectedMessage)) {
        differences.push(`Rjest did not emit ${JSON.stringify(expectedMessage)}`);
      }
    }
    if (testCase.compareNoFailedMessage) {
      const expectedMessage = 'No failed test found.';
      const jestOutputText = `${jestRun.stdout}\n${jestRun.stderr}`;
      const rjestOutputText = `${rjestRun.stdout}\n${rjestRun.stderr}`;
      if (!jestOutputText.includes(expectedMessage)) {
        fail(`${label}: Jest did not emit the expected no-failures message`, jestRun);
      }
      if (!rjestOutputText.includes(expectedMessage)) {
        differences.push('Rjest did not emit the no-failures message');
      }
    }

    let jestResult;
    let rjestResult;
    if (testCase.skipResultComparison) {
      jestResult = {exit: jestRun.status};
      rjestResult = {exit: rjestRun.status};
    } else if (testCase.compareOutput) {
      jestResult = normalizeProcessOutput(jestRun);
      rjestResult = normalizeProcessOutput(rjestRun);
      if (JSON.stringify(jestResult) !== JSON.stringify(rjestResult)) {
        differences.push('process output differs');
      }
    } else if (testCase.compareExecutionMarkers) {
      jestResult = {executionMarkers: readExecutionMarkers(jestFixture)};
      rjestResult = {executionMarkers: readExecutionMarkers(rjestFixture)};
      if (testCase.compareCacheDirectory) {
        jestResult.cacheDirectoryExists = existsSync(
          join(jestFixture, testCase.compareCacheDirectory),
        );
        rjestResult.cacheDirectoryExists = existsSync(
          join(rjestFixture, testCase.compareCacheDirectory),
        );
        if (
          jestResult.cacheDirectoryExists !== testCase.expectedCacheDirectoryExists ||
          rjestResult.cacheDirectoryExists !== testCase.expectedCacheDirectoryExists
        ) {
          differences.push('cache directory state differs from the oracle expectation');
        }
      }
      if (JSON.stringify(jestResult) !== JSON.stringify(rjestResult)) {
        differences.push('executed test files differ');
      }
    } else {
      const rawJestResult = JSON.parse(readFileSync(jestOutput, 'utf8'));
      jestResult = normalizeJest(rawJestResult, testCase);
      try {
        const rawRjestResult = JSON.parse(
          testCase.rjestOutputFile ? readFileSync(rjestOutput, 'utf8') : rjestRun.stdout,
        );
        rjestResult =
          testCase.rjestResultFormat === 'jest'
            ? normalizeJest(rawRjestResult, testCase)
            : normalizeRjest(rawRjestResult, testCase);
        if (JSON.stringify(jestResult) !== JSON.stringify(rjestResult)) {
          differences.push('test results differ');
        }
        for (const field of testCase.compareResultFields ?? []) {
          if (
            JSON.stringify(canonicalize(rawJestResult[field])) !==
            JSON.stringify(canonicalize(rawRjestResult[field]))
          ) {
            differences.push(`result field differs: ${field}`);
          }
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
      let jestCoverage;
      try {
        jestCoverage = normalizeCoverageSummary(
          JSON.parse(readFileSync(join(jestFixture, '.coverage', 'coverage-summary.json'), 'utf8')),
        );
      } catch (error) {
        fail(`${label}: Jest coverage summary unavailable: ${error.message}`, jestRun);
      }
      try {
        const rjestCoverage = normalizeCoverageSummary(
          JSON.parse(readFileSync(join(rjestFixture, '.coverage', 'coverage-summary.json'), 'utf8')),
        );
        if (JSON.stringify(jestCoverage) !== JSON.stringify(rjestCoverage)) {
          differences.push('coverage summaries differ');
        }
      } catch (error) {
        differences.push(`Rjest coverage summary unavailable: ${error.message}`);
      }
    }

    const compatible = differences.length === 0;
    const expectedCompatibility = testCase.compatible ?? true;
    if (compatible !== expectedCompatibility) {
      if (compatible) {
        fail(`${label}: known incompatibility now passes; mark the probe compatible`, rjestRun);
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

async function compareWatchCase(testCase) {
  const sourceFixture = join(fixtures, testCase.name);
  const temporary = mkdtempSync(join(tmpdir(), 'rjest-watch-compat-'));
  const jestFixture = join(temporary, 'jest');
  const rjestFixture = join(temporary, 'rjest');
  try {
    cpSync(sourceFixture, jestFixture, {recursive: true});
    cpSync(sourceFixture, rjestFixture, {recursive: true});
    const environment = {
      ...process.env,
      CI: '',
      NODE_PATH: join(repository, 'node_modules'),
    };
    const jestResult = await exerciseWatchProcess({
      command: process.execPath,
      args: [jest, '--watchAll', '--runInBand', '--no-cache', '--no-watchman'],
      cwd: jestFixture,
      environment,
      label: `Jest (${testCase.name})`,
    });
    const rjestResult = await exerciseWatchProcess({
      command: rjest,
      args: ['--watchAll', '--runInBand', '--no-cache', '--no-watchman'],
      cwd: rjestFixture,
      environment,
      label: `Rjest (${testCase.name})`,
    });
    const differences = [];
    if (JSON.stringify(jestResult.runs) !== JSON.stringify(rjestResult.runs)) {
      differences.push('watch run results differ');
    }
    if (rjestResult.extraRuns !== 0) {
      differences.push(`Rjest emitted ${rjestResult.extraRuns} unexpected rerun(s)`);
    }
    if (jestResult.extraRuns !== 0) {
      fail(
        `${testCase.name}: Jest oracle emitted ${jestResult.extraRuns} unexpected rerun(s)`,
        jestResult,
      );
    }
    if (differences.length > 0) {
      console.error(`Differential mismatch for ${testCase.name}: ${differences.join('; ')}`);
      console.error('Jest:', JSON.stringify(jestResult.runs, null, 2));
      console.error('Rjest:', JSON.stringify(rjestResult.runs, null, 2));
      fail(`${testCase.name}: expected Jest watch parity`, rjestResult);
    }
    return {
      name: testCase.name,
      category: testCase.category,
      compatible: true,
      differences,
    };
  } finally {
    rmSync(temporary, {recursive: true, force: true});
  }
}

function compareWatchCompatibilityCase(testCase) {
  switch (testCase.mode) {
    case 'all':
      return compareWatchCase(testCase);
    case 'related':
      return compareRelatedWatchCase(testCase);
    case 'related-no-scm':
      return compareNoScmWatchCase(testCase);
    case 'interactive':
      return compareInteractiveWatchCase(testCase);
    default:
      throw new Error(`Unknown watch compatibility mode: ${testCase.mode}`);
  }
}

async function compareRelatedWatchCase(testCase) {
  const sourceFixture = join(fixtures, testCase.name);
  const temporary = mkdtempSync(join(tmpdir(), 'rjest-related-watch-compat-'));
  const jestFixture = join(temporary, 'jest');
  const rjestFixture = join(temporary, 'rjest');
  try {
    cpSync(sourceFixture, jestFixture, {recursive: true});
    cpSync(sourceFixture, rjestFixture, {recursive: true});
    initializeGitFixture(jestFixture, `Jest (${testCase.name})`);
    initializeGitFixture(rjestFixture, `Rjest (${testCase.name})`);
    const environment = {
      ...process.env,
      CI: '',
      NODE_PATH: join(repository, 'node_modules'),
      NODE_OPTIONS: [process.env.NODE_OPTIONS, '--experimental-vm-modules']
        .filter(Boolean)
        .join(' '),
    };
    const jestResult = await exerciseRelatedWatchProcess({
      command: process.execPath,
      args: [jest, '--watch', '--runInBand', '--no-cache', '--no-watchman'],
      cwd: jestFixture,
      environment,
      label: `Jest (${testCase.name})`,
    });
    const rjestResult = await exerciseRelatedWatchProcess({
      command: rjest,
      args: ['--watch', '--runInBand', '--no-cache', '--no-watchman'],
      cwd: rjestFixture,
      environment,
      label: `Rjest (${testCase.name})`,
    });
    const differences = [];
    if (JSON.stringify(jestResult.runs) !== JSON.stringify(rjestResult.runs)) {
      differences.push('related watch run results differ');
    }
    if (rjestResult.extraRuns !== 0) {
      differences.push(`Rjest emitted ${rjestResult.extraRuns} unexpected rerun(s)`);
    }
    if (jestResult.extraRuns !== 0) {
      fail(
        `${testCase.name}: Jest oracle emitted ${jestResult.extraRuns} unexpected rerun(s)`,
        jestResult,
      );
    }
    if (differences.length > 0) {
      console.error(`Differential mismatch for ${testCase.name}: ${differences.join('; ')}`);
      console.error('Jest:', JSON.stringify(jestResult.runs, null, 2));
      console.error('Rjest:', JSON.stringify(rjestResult.runs, null, 2));
      fail(`${testCase.name}: expected Jest related-watch parity`, rjestResult);
    }
    return {
      name: testCase.name,
      category: testCase.category,
      compatible: true,
      differences,
    };
  } finally {
    rmSync(temporary, {recursive: true, force: true});
  }
}

async function compareInteractiveWatchCase(testCase) {
  const sourceFixture = join(fixtures, testCase.name);
  const temporary = mkdtempSync(join(tmpdir(), 'rjest-interactive-watch-compat-'));
  const jestFixture = join(temporary, 'jest');
  const rjestFixture = join(temporary, 'rjest');
  try {
    cpSync(sourceFixture, jestFixture, {recursive: true});
    cpSync(sourceFixture, rjestFixture, {recursive: true});
    const environment = {
      ...process.env,
      CI: '',
      NODE_PATH: join(repository, 'node_modules'),
    };
    const jestState = join(temporary, 'jest-state.txt');
    const rjestState = join(temporary, 'rjest-state.txt');
    writeFileSync(jestState, 'slow\n');
    writeFileSync(rjestState, 'slow\n');
    const jestResult = await exerciseInteractiveWatchProcess({
      command: process.execPath,
      args: [jest, '--watchAll', '--maxWorkers=2', '--no-cache', '--no-watchman'],
      cwd: jestFixture,
      environment,
      label: `Jest (${testCase.name})`,
      marker: join(temporary, 'jest-started.marker'),
      results: join(temporary, 'jest-results.jsonl'),
      state: jestState,
    });
    const rjestResult = await exerciseInteractiveWatchProcess({
      command: rjest,
      args: ['--watchAll', '--maxWorkers=2', '--no-cache', '--no-watchman'],
      cwd: rjestFixture,
      environment,
      label: `Rjest (${testCase.name})`,
      marker: join(temporary, 'rjest-started.marker'),
      results: join(temporary, 'rjest-results.jsonl'),
      state: rjestState,
    });
    const differences = [];
    if (JSON.stringify(jestResult.runs) !== JSON.stringify(rjestResult.runs)) {
      differences.push('interactive rerun results differ');
    }
    if (jestResult.interruptionMs > 5_000) {
      fail(`${testCase.name}: Jest oracle did not interrupt its active run promptly`, jestResult);
    }
    if (rjestResult.interruptionMs > 5_000) {
      differences.push(`Rjest active-run interruption took ${rjestResult.interruptionMs} ms`);
    }
    if (jestResult.exitCode !== rjestResult.exitCode) {
      differences.push(`interactive exit ${rjestResult.exitCode} != Jest ${jestResult.exitCode}`);
    }
    if (differences.length > 0) {
      console.error(`Differential mismatch for ${testCase.name}: ${differences.join('; ')}`);
      console.error('Jest:', JSON.stringify(jestResult, null, 2));
      console.error('Rjest:', JSON.stringify(rjestResult, null, 2));
      fail(`${testCase.name}: expected Jest interactive-watch parity`, rjestResult);
    }
    return {
      name: testCase.name,
      category: testCase.category,
      compatible: true,
      differences,
    };
  } finally {
    rmSync(temporary, {recursive: true, force: true});
  }
}

async function exerciseInteractiveWatchProcess({
  command,
  args,
  cwd,
  environment,
  label,
  marker,
  results,
  state,
}) {
  const child = spawnInPseudoTerminal(command, args, {
    cwd,
    env: {
      ...environment,
      RJEST_INTERACTIVE_RESULTS: results,
      RJEST_INTERACTIVE_STARTED: marker,
      RJEST_INTERACTIVE_STATE: state,
    },
  });
  let stdout = '';
  let stderr = '';
  let spawnError;
  child.stdout.on('data', chunk => {
    stdout += chunk;
  });
  child.stderr.on('data', chunk => {
    stderr += chunk;
  });
  child.on('error', error => {
    spawnError = error;
  });

  let interruptionMs;
  try {
    await waitForFile({child, label, output: () => ({stdout, stderr}), path: marker});
    const interruptedAt = Date.now();
    writeFileSync(state, 'ready\n');
    child.stdin.write('\r');
    await waitForOutput({
      child,
      label,
      output: () => ({stdout, stderr}),
      predicate: () => /Watch Usage/i.test(`${stdout}\n${stderr}`),
    });
    interruptionMs = Date.now() - interruptedAt;
    child.stdin.write('\r');
    await waitForFile({child, label, output: () => ({stdout, stderr}), path: results});
    await delay(500);
    child.stdin.write('q');
    await waitForNaturalExit({child, label, output: () => ({stdout, stderr})});
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGINT');
    await waitForExit(child);
  }
  if (spawnError) fail(`${label} could not start: ${spawnError.message}`, {stdout, stderr});
  const runs = readFileSync(results, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
  return {exitCode: child.exitCode, interruptionMs, runs, stderr, stdout};
}

function spawnInPseudoTerminal(command, args, options) {
  return spawn('python3', [ptyRunner, command, ...args], {
    ...options,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

async function waitForOutput({child, label, output, predicate}) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    if (child.exitCode !== null || child.signalCode !== null) {
      const error = new Error(`${label} exited before producing expected terminal output`);
      Object.assign(error, output());
      throw error;
    }
    await delay(25);
  }
  const error = new Error(`${label} timed out waiting for terminal output`);
  Object.assign(error, output());
  throw error;
}

async function waitForNaturalExit({child, label, output}) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await delay(25);
  }
  const error = new Error(`${label} did not exit after the idle q command`);
  Object.assign(error, output());
  throw error;
}

async function waitForFile({child, label, output, path}) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (existsSync(path)) return;
    if (child.exitCode !== null || child.signalCode !== null) {
      const error = new Error(`${label} exited before creating ${path}`);
      Object.assign(error, output());
      throw error;
    }
    await delay(25);
  }
  const error = new Error(`${label} timed out waiting for ${path}`);
  Object.assign(error, output());
  throw error;
}

async function compareNoScmWatchCase(testCase) {
  const sourceFixture = join(fixtures, testCase.fixtureName ?? testCase.name);
  const temporary = mkdtempSync(join(tmpdir(), 'rjest-no-scm-watch-compat-'));
  const jestFixture = join(temporary, 'jest');
  const rjestFixture = join(temporary, 'rjest');
  try {
    cpSync(sourceFixture, jestFixture, {recursive: true});
    cpSync(sourceFixture, rjestFixture, {recursive: true});
    const environment = {
      ...process.env,
      CI: '',
      NODE_PATH: join(repository, 'node_modules'),
      NODE_OPTIONS: [process.env.NODE_OPTIONS, '--experimental-vm-modules']
        .filter(Boolean)
        .join(' '),
    };
    const jestResult = spawnSync(
      process.execPath,
      [jest, '--watch', '--runInBand', '--no-cache', '--no-watchman'],
      {cwd: jestFixture, env: environment, encoding: 'utf8'},
    );
    const rjestResult = spawnSync(
      rjest,
      ['--watch', '--runInBand', '--no-cache', '--no-watchman'],
      {cwd: rjestFixture, env: environment, encoding: 'utf8'},
    );
    assertSpawned(jestResult, `Jest (${testCase.name})`);
    assertSpawned(rjestResult, `Rjest (${testCase.name})`);
    const jestOutput = `${jestResult.stdout}\n${jestResult.stderr}`;
    const rjestOutput = `${rjestResult.stdout}\n${rjestResult.stderr}`;
    const differences = [];
    if (jestResult.status !== rjestResult.status) {
      differences.push(`exit ${rjestResult.status} != Jest ${jestResult.status}`);
    }
    if (
      !/--watch is not supported without .*git/i.test(jestOutput) ||
      !/--watch is not supported without .*git/i.test(rjestOutput)
    ) {
      differences.push('no-SCM watch warning is missing');
    }
    if (!/use --watchAll/i.test(jestOutput) || !/use --watchAll/i.test(rjestOutput)) {
      differences.push('watchAll recovery guidance is missing');
    }
    if (differences.length > 0) {
      console.error(`Differential mismatch for ${testCase.name}: ${differences.join('; ')}`);
      console.error('Jest:', jestOutput);
      console.error('Rjest:', rjestOutput);
      fail(`${testCase.name}: expected Jest no-SCM watch parity`, rjestResult);
    }
    return {
      name: testCase.name,
      category: testCase.category,
      compatible: true,
      differences,
    };
  } finally {
    rmSync(temporary, {recursive: true, force: true});
  }
}

function initializeGitFixture(cwd, label) {
  for (const args of [
    ['init', '-b', 'main'],
    ['config', 'user.email', 'rjest-compat@example.test'],
    ['config', 'user.name', 'Rjest Compatibility'],
    ['add', '.'],
    ['commit', '-m', 'baseline'],
  ]) {
    const run = spawnSync('git', args, {cwd, encoding: 'utf8'});
    assertSpawned(run, `${label} Git ${args[0]}`);
    if (run.status !== 0) fail(`${label}: Git ${args[0]} exited ${run.status}`, run);
  }
}

function prepareChangedSelectionFixture(cwd, scenario, label) {
  if (scenario.startsWith('config-')) {
    const configPath = join(cwd, 'jest.config.cjs');
    const config = readFileSync(configPath, 'utf8');
    writeFileSync(configPath, config.replace('  transform: {},', '  onlyChanged: true,\n  transform: {},'));
  }
  initializeGitFixture(cwd, label);
  const tag = spawnSync('git', ['tag', 'baseline'], {cwd, encoding: 'utf8'});
  assertSpawned(tag, `${label} Git tag`);
  if (tag.status !== 0) fail(`${label}: Git tag exited ${tag.status}`, tag);

  if (scenario === 'working' || scenario === 'config-working') {
    appendFileSync(join(cwd, 'alpha.cjs'), '\n// working tree change\n');
    return;
  }
  if (scenario === 'coverage-working') {
    appendFileSync(join(cwd, 'a.js'), '\n// working tree change\n');
    return;
  }
  if (scenario === 'history') {
    appendFileSync(join(cwd, 'alpha.cjs'), '\n// committed change\n');
    for (const args of [
      ['add', 'alpha.cjs'],
      ['commit', '-m', 'change alpha'],
    ]) {
      const run = spawnSync('git', args, {cwd, encoding: 'utf8'});
      assertSpawned(run, `${label} Git ${args[0]}`);
      if (run.status !== 0) fail(`${label}: Git ${args[0]} exited ${run.status}`, run);
    }
    appendFileSync(join(cwd, 'beta.mjs'), '\n// working tree change\n');
  }
}

async function exerciseRelatedWatchProcess({command, args, cwd, environment, label}) {
  const artifact = join(cwd, 'watch-results.jsonl');
  const alpha = join(cwd, 'alpha.cjs');
  const beta = join(cwd, 'beta.mjs');
  const unrelated = join(cwd, 'unrelated.cjs');
  const addedTest = join(cwd, 'gamma.test.cjs');
  writeFileSync(alpha, "module.exports = {value: 'alpha'};\n// changed\n");
  const child = spawn(command, args, {
    cwd,
    env: environment,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let spawnError;
  child.stdout.on('data', chunk => {
    stdout += chunk;
  });
  child.stderr.on('data', chunk => {
    stderr += chunk;
  });
  child.on('error', error => {
    spawnError = error;
  });

  try {
    await waitForWatchRuns({
      artifact,
      child,
      count: 1,
      label,
      output: () => ({stdout, stderr}),
    });
    writeFileSync(alpha, "module.exports = {value: 'alpha'};\n");
    writeFileSync(beta, "export const value = 'beta';\n// changed\n");
    await waitForWatchRuns({
      artifact,
      child,
      count: 2,
      label,
      output: () => ({stdout, stderr}),
    });
    writeFileSync(unrelated, "module.exports = {value: 'unrelated'};\n");
    await waitForWatchRuns({
      artifact,
      child,
      count: 3,
      label,
      output: () => ({stdout, stderr}),
    });
    writeFileSync(beta, "export const value = 'beta';\n");
    writeFileSync(
      addedTest,
      "test('newly changed gamma suite', () => {\n" +
        "  expect(require('./alpha.cjs').value).toBe('alpha');\n" +
        '});\n',
    );
    await waitForWatchRuns({
      artifact,
      child,
      count: 4,
      label,
      output: () => ({stdout, stderr}),
    });
    rmSync(addedTest);
    rmSync(unrelated);
    await waitForWatchRuns({
      artifact,
      child,
      count: 5,
      label,
      output: () => ({stdout, stderr}),
    });
    await delay(800);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGINT');
    await waitForExit(child);
  }
  if (spawnError) fail(`${label} could not start: ${spawnError.message}`, {stdout, stderr});
  const runs = readWatchRuns(artifact);
  return {
    runs: runs.slice(0, 5),
    extraRuns: Math.max(0, runs.length - 5),
    stdout,
    stderr,
  };
}

async function exerciseWatchProcess({command, args, cwd, environment, label}) {
  const artifact = join(cwd, 'watch-results.jsonl');
  const shared = join(cwd, 'shared.cjs');
  const addedTest = join(cwd, 'gamma.test.cjs');
  const child = spawn(command, args, {
    cwd,
    env: environment,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let spawnError;
  child.stdout.on('data', chunk => {
    stdout += chunk;
  });
  child.stderr.on('data', chunk => {
    stderr += chunk;
  });
  child.on('error', error => {
    spawnError = error;
  });

  try {
    await waitForWatchRuns({
      artifact,
      child,
      count: 1,
      label,
      output: () => ({stdout, stderr}),
    });
    writeFileSync(shared, 'module.exports = {value: 2};\n');
    await waitForWatchRuns({
      artifact,
      child,
      count: 2,
      label,
      output: () => ({stdout, stderr}),
    });
    writeFileSync(shared, 'module.exports = {value: 1};\n');
    await waitForWatchRuns({
      artifact,
      child,
      count: 3,
      label,
      output: () => ({stdout, stderr}),
    });
    writeFileSync(
      addedTest,
      "const {value} = require('./shared.cjs');\n\n" +
        "test('newly discovered gamma suite', () => {\n" +
        '  expect(value).toBe(1);\n' +
        '});\n',
    );
    await waitForWatchRuns({
      artifact,
      child,
      count: 4,
      label,
      output: () => ({stdout, stderr}),
    });
    rmSync(addedTest);
    await waitForWatchRuns({
      artifact,
      child,
      count: 5,
      label,
      output: () => ({stdout, stderr}),
    });
    await delay(800);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGINT');
    await waitForExit(child);
  }
  if (spawnError) fail(`${label} could not start: ${spawnError.message}`, {stdout, stderr});
  const runs = readWatchRuns(artifact);
  return {
    runs: runs.slice(0, 5),
    extraRuns: Math.max(0, runs.length - 5),
    stdout,
    stderr,
  };
}

async function waitForWatchRuns({artifact, child, count, label, output}) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (readWatchRuns(artifact).length >= count) return;
    if (child.exitCode !== null || child.signalCode !== null) {
      const error = new Error(`${label} exited before watch run ${count}`);
      Object.assign(error, output());
      throw error;
    }
    await delay(75);
  }
  const error = new Error(`${label} timed out waiting for watch run ${count}`);
  Object.assign(error, output());
  throw error;
}

function readWatchRuns(artifact) {
  if (!existsSync(artifact)) return [];
  return readFileSync(artifact, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

async function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  const timedOut = await Promise.race([exited.then(() => false), delay(3_000).then(() => true)]);
  if (!timedOut) return;
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  await Promise.race([exited, delay(2_000)]);
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function readOptionalArtifact(fixture, relativePath) {
  const path = join(fixture, relativePath);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

function normalizeCoverageSummary(summary) {
  return canonicalize(
    Object.fromEntries(
      Object.entries(summary)
        .map(([path, metrics]) => [path === 'total' ? path : basename(path), metrics])
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
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
  const installation = spawnSync(process.execPath, [yarnPath, 'install', '--immutable'], {
    cwd: fixture,
    encoding: 'utf8',
    env: {
      ...process.env,
      YARN_ENABLE_GLOBAL_CACHE: 'false',
      YARN_NODE_LINKER: 'pnp',
    },
  });
  assertSpawned(installation, 'Yarn PnP fixture install');
  if (installation.status !== 0) {
    fail(`Yarn PnP fixture install exited ${installation.status}`, installation);
  }
}

function pnpmVirtualHoistPath(fixture) {
  return join(fixture, 'node_modules', '.pnpm', 'node_modules');
}

function preparePnpmVirtualHoist(fixture) {
  cpSync(
    join(fixture, 'virtual-transform-dependency'),
    join(pnpmVirtualHoistPath(fixture), 'virtual-transform-dependency'),
    {recursive: true},
  );
}

function prepareInstalledJest(fixture, packageName) {
  const nodeModules = join(fixture, 'node_modules');
  mkdirSync(nodeModules, {recursive: true});
  symlinkSync(join(repository, 'node_modules', packageName), join(nodeModules, 'jest'), 'junction');
}

function prepareContaminatedBabelJest(nodeModules) {
  const babelJest = join(nodeModules, 'babel-jest');
  mkdirSync(babelJest, {recursive: true});
  writeFileSync(
    join(babelJest, 'package.json'),
    JSON.stringify({name: 'babel-jest', main: 'index.js'}),
  );
  writeFileSync(
    join(babelJest, 'index.js'),
    "throw new Error('runner-visible Babel-Jest must not be loaded');\n",
  );
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
        snapshots.push({
          path: child,
          contents: readFileSync(absolute, 'utf8'),
        });
      }
    }
  }
}

function readExecutionMarkers(root) {
  return readdirSync(root)
    .filter(name => name.endsWith('.marker'))
    .sort()
    .map(name => ({
      name,
      contents: readFileSync(join(root, name), 'utf8'),
    }));
}

function removeExecutionMarkers(root) {
  for (const marker of readExecutionMarkers(root)) {
    rmSync(join(root, marker.name));
  }
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

function normalizeProcessOutput(run) {
  return {
    stderr: run.stderr.replaceAll('\r\n', '\n').trim(),
    stdout: run.stdout.replaceAll('\r\n', '\n').trim(),
  };
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
