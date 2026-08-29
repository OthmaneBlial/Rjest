# AWS Amplify Interactions compatibility corpus

AWS Amplify JS is the pinned Yarn-workspace monorepo corpus used to test Rjest
against unchanged package suites after the repository's production build.
Interactions is the eleventh package with a strict machine comparison from this
checkout.

## Reproduction target

- Repository: <https://github.com/aws-amplify/amplify-js>
- Commit: `36e3ce19983925ee6a68b75ebd9a01a95100989b`
- Lockfile SHA-256: `6308d9264f5139363854e7cd04e891d30101ef6cbb625a7e3bdb32d9f51cf6ec`
- Install command: `yarn install --frozen-lockfile`
- Build command: `yarn build`
- Runtime: Node 24.20.0 and Yarn 1.22.22
- Package: `@aws-amplify/interactions` 6.1.36
- Locked Jest: 29.7.0
- Locked ts-jest: 29.4.0
- Locked TypeScript: 5.8.3

The checkout, tests, Jest configuration, and lockfile remain unmodified. The
original package command passed ESLint and its 88.6% TypeScript coverage gate at
906/910 declarations (99.56%), then passed 8/8 Jest suites and all 30 tests.
Jest reported 5.95 seconds within that complete command; the command took 16.99
seconds wall time and reached a 740,737,024-byte peak RSS.

Interactions exercises inherited executable configuration, `ts-jest`, JSDOM,
`moduleNameMapper` resolution for UUID, automatic mocks, Lex V1 and V2 AWS SDK
clients and commands, blobs and array buffers, callback and promise paths, and
asynchronous `fflate` compression implemented with generated eval-based Node
worker threads.

## Exact result

| Measurement | Official Jest | Rjest |
| --- | ---: | ---: |
| Discovered suites | 8 | 8 |
| Passing suites | 8 | 8 |
| Registered tests | 30 | 30 |
| Passing tests | 30 | 30 |
| Skipped / todo tests | 0 / 0 | 0 / 0 |
| Snapshots | 0 | 0 |
| Instrumented source files | 19 | 19 |
| Statements | 211 / 218 (96.78%) | 211 / 218 (96.78%) |
| Branches | 41 / 52 (78.84%) | 41 / 52 (78.84%) |
| Functions | 38 / 40 (95%) | 38 / 40 (95%) |
| Lines | 187 / 193 (96.89%) | 187 / 193 (96.89%) |
| Exit code | 0 | 0 |

The reusable corpus comparator found exact suite paths, exact test identities
and statuses, exact snapshot totals, zero Rjest file errors, and exact aggregate
and per-file Istanbul summary parity across all 19 source files.

The warm official serial measurement reported 3.096 seconds (6.04 seconds wall
and 512,720,896-byte peak RSS). The final serial Rjest measurement reported
40.556 seconds (43.50 seconds wall and 666,288,128-byte peak RSS). Rjest was
13.10 times slower by reported runner time, 7.20 times slower by wall time, and
used 1.30 times the peak RSS in these single measurements. This is compatibility
evidence, not a benchmark win.

## Commands

The checkout and machine-readable results live under ignored `base/corpus`:

```sh
cd base/corpus/amplify-js
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/interactions test
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/interactions run jest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-interactions/official-node24.json
cd packages/interactions
CI=true npm exec --yes --package=node@24 -- \
  ../../../../../target/debug/rjest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-interactions/rjest-final-node24.json
cd ../../../../..
npm run compare:corpus -- \
  --root base/corpus/amplify-js/packages/interactions \
  base/corpus/results/amplify-interactions/official-node24.json \
  base/corpus/results/amplify-interactions/rjest-final-node24.json
```

## Compatibility result

The first Rjest run passed 28 tests but failed both Lex V2 fulfillment tests
because the runner's `--input-type=module` bootstrap flag leaked into
`worker_threads`. The `fflate` dependency creates CommonJS worker source with
`{ eval: true }`; inherited module mode reinterpreted that source as ESM and
raised `ReferenceError: u8 is not defined`.

Rjest now materializes its embedded runtime as one private temporary `.mjs` file
per invocation and starts Node without runner-only eval or input-type flags. A
new official-Jest differential fixture proves that user-created eval workers
retain CommonJS semantics. The versioned denominator is now 56/56 scenarios,
and the unchanged Interactions package reaches strict parity without
suppressing tests or weakening its coverage thresholds.
