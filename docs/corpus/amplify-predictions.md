# AWS Amplify Predictions compatibility corpus

AWS Amplify JS is the pinned Yarn-workspace monorepo corpus used to test Rjest
against unchanged package suites after the repository's production build.
Predictions adds a machine-learning client workload with large AWS SDK module
graphs and binary/browser data paths.

## Reproduction target

- Repository: <https://github.com/aws-amplify/amplify-js>
- Commit: `36e3ce19983925ee6a68b75ebd9a01a95100989b`
- Lockfile SHA-256: `6308d9264f5139363854e7cd04e891d30101ef6cbb625a7e3bdb32d9f51cf6ec`
- Install command: `yarn install --frozen-lockfile`
- Build command: `yarn build`
- Runtime: Node 24.20.0 and Yarn 1.22.22
- Package: `@aws-amplify/predictions` 6.1.73
- Locked Jest: 29.7.0
- Locked ts-jest: 29.4.0
- Locked TypeScript: 5.8.3

The checkout, tests, Jest configuration, and lockfile remain unmodified. The
package's original `test` command passed ESLint, its 87.84% TypeScript coverage
gate at 2,837/2,954 declarations (96.04%), and all four Jest suites. The Jest
surface includes inherited executable configuration, `ts-jest`, JSDOM,
`moduleNameMapper`, automatic and factory mocks, AWS SDK clients, blobs,
buffers, callback/promise behavior, coverage thresholds, and heap reporting.

## Exact result

| Measurement | Official Jest | Rjest |
| --- | ---: | ---: |
| Discovered suites | 4 | 4 |
| Passing suites | 4 | 4 |
| Registered tests | 51 | 51 |
| Passing / skipped tests | 50 / 1 | 50 / 1 |
| Snapshots | 0 | 0 |
| Instrumented source files | 12 | 12 |
| Statements | 556 / 623 (89.24%) | 556 / 623 (89.24%) |
| Branches | 179 / 279 (64.15%) | 179 / 279 (64.15%) |
| Functions | 91 / 105 (86.66%) | 91 / 105 (86.66%) |
| Lines | 545 / 610 (89.34%) | 545 / 610 (89.34%) |
| Exit code | 0 | 0 |

The reusable corpus comparator found exact suite paths, exact test identities
and statuses, exact snapshot totals, zero Rjest file errors, and exact aggregate
and per-file Istanbul summary parity across all 12 source files.

The captured official serial run reported 2.761 seconds (5.85 seconds wall and
527,859,712-byte peak RSS). Rjest reported 29.265 seconds (31.56 seconds wall
and 938,065,920-byte peak RSS). Rjest was 10.60 times slower by reported runner
time, 5.39 times slower by wall time, and used 1.78 times the peak RSS in these
single measurements. This is compatibility evidence, not a controlled
benchmark; both runners used an already-built checkout and existing caches.

## Commands

The checkout and machine-readable results live under ignored `base/corpus`:

```sh
cd base/corpus/amplify-js
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/predictions test
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/predictions run jest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-predictions/official-node24.json
cd packages/predictions
CI=true npm exec --yes --package=node@24 -- \
  ../../../../../target/debug/rjest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-predictions/rjest-first-node24.json
cd ../../../../..
npm run compare:corpus -- \
  --root base/corpus/amplify-js/packages/predictions \
  base/corpus/results/amplify-predictions/official-node24.json \
  base/corpus/results/amplify-predictions/rjest-first-node24.json
```

## Compatibility result

The first Rjest execution matched the full behavioral and coverage surface, so
no runtime change was needed for this package. This result is independent
real-project evidence and does not inflate the bounded differential score. It
proves parity only for this pinned Predictions package; other workspace
packages and unrelated Jest projects remain separate corpus work.
