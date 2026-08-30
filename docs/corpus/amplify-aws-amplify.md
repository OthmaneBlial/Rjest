# AWS Amplify facade compatibility corpus

AWS Amplify JS is the pinned Yarn-workspace monorepo corpus used to test Rjest
against unchanged package suites after the repository's production build. The
top-level `aws-amplify` package validates the public facade across many built
workspace packages rather than one isolated category.

## Reproduction target

- Repository: <https://github.com/aws-amplify/amplify-js>
- Commit: `36e3ce19983925ee6a68b75ebd9a01a95100989b`
- Lockfile SHA-256: `6308d9264f5139363854e7cd04e891d30101ef6cbb625a7e3bdb32d9f51cf6ec`
- Install command: `yarn install --frozen-lockfile`
- Build command: `yarn build`
- Runtime: Node 24.20.0 and Yarn 1.22.22
- Package: `aws-amplify` 6.20.0
- Locked Jest: 29.7.0
- Locked ts-jest: 29.4.0
- Locked TypeScript: 5.8.3

The checkout, tests, Jest configuration, and lockfile remain unmodified. The
original `test` command passed ESLint, its 93.26% TypeScript coverage gate at
262/262 declarations (100%), and all seven Jest suites. The package exercises
inherited executable configuration, `ts-jest`, JSDOM, public export inventories
across Auth, API, Analytics, Storage, DataStore, and messaging packages,
automatic and factory mocks, spies, async server-context cleanup, cookie-backed
storage adapters, coverage exclusions and thresholds, and heap reporting.

## Exact result

| Measurement | Official Jest | Rjest |
| --- | ---: | ---: |
| Discovered suites | 7 | 7 |
| Passing suites | 7 | 7 |
| Registered / passing tests | 50 / 50 | 50 / 50 |
| Skipped / todo tests | 0 / 0 | 0 / 0 |
| Snapshots | 0 | 0 |
| Instrumented source files | 21 | 21 |
| Statements | 82 / 82 (100%) | 82 / 82 (100%) |
| Branches | 18 / 18 (100%) | 18 / 18 (100%) |
| Functions | 15 / 15 (100%) | 15 / 15 (100%) |
| Lines | 74 / 74 (100%) | 74 / 74 (100%) |
| Exit code | 0 | 0 |

The reusable comparator found exact suite paths, exact test identities and
statuses, exact snapshot totals, zero Rjest file errors, and exact aggregate
and per-file Istanbul summary parity across all 21 source files.

The captured official serial run reported 3.256 seconds (6.48 seconds wall and
537,034,752-byte peak RSS). Rjest reported 55.643 seconds (57.86 seconds wall
and 1,062,223,872-byte peak RSS). Rjest was 17.09 times slower by reported
runner time, 8.93 times slower by wall time, and used 1.98 times the peak RSS in
these single measurements. This is compatibility evidence, not a controlled
benchmark.

## Commands

The checkout and machine-readable results live under ignored `base/corpus`:

```sh
cd base/corpus/amplify-js
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace aws-amplify test
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace aws-amplify run jest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-aws-amplify/official-node24.json
cd packages/aws-amplify
CI=true npm exec --yes --package=node@24 -- \
  ../../../../../target/debug/rjest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-aws-amplify/rjest-first-node24.json
cd ../../../../..
npm run compare:corpus -- \
  --root base/corpus/amplify-js/packages/aws-amplify \
  base/corpus/results/amplify-aws-amplify/official-node24.json \
  base/corpus/results/amplify-aws-amplify/rjest-first-node24.json
```

## Compatibility result

The first Rjest execution matched the full behavioral and coverage surface, so
no runtime change was needed for this package. This independent real-project
result does not inflate the bounded differential score.
