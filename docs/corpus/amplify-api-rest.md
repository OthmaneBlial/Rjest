# AWS Amplify API REST compatibility corpus

AWS Amplify JS is the pinned Yarn-workspace monorepo corpus used to test Rjest
against unchanged package suites after the repository's production build. API
REST is the eighth package with a strict machine comparison from this checkout.

## Reproduction target

- Repository: <https://github.com/aws-amplify/amplify-js>
- Commit: `36e3ce19983925ee6a68b75ebd9a01a95100989b`
- Lockfile SHA-256: `6308d9264f5139363854e7cd04e891d30101ef6cbb625a7e3bdb32d9f51cf6ec`
- Install command: `yarn install --frozen-lockfile`
- Build command: `yarn build`
- Runtime: Node 24.20.0 and Yarn 1.22.22
- Package: `@aws-amplify/api-rest` 4.6.4
- Locked Jest: 29.7.0
- Locked ts-jest: 29.4.0
- Locked TypeScript: 5.8.3

The checkout, tests, Jest configuration, and lockfile remain unmodified. The
original package command passed ESLint with one existing warning and passed its
70% TypeScript coverage gate at 1,228/1,249 declarations (98.32%). It then
passed all 10 Jest suites and 208 tests. Jest reported 10.086 seconds within
that complete command; the command took 16.77 seconds wall time and reached a
686,325,760-byte peak RSS.

API REST exercises inherited executable configuration, `ts-jest`, JSDOM,
automatic and factory module mocks, `jest.mocked`, function and prototype
spies, abort/cancellation behavior, request signing, response parsing, timeout
spies, package exports, coverage thresholds, and heap reporting.

## Exact result

| Measurement | Official Jest | Rjest |
| --- | ---: | ---: |
| Discovered suites | 10 | 10 |
| Passing suites | 10 | 10 |
| Registered tests | 208 | 208 |
| Passing tests | 208 | 208 |
| Skipped / todo tests | 0 / 0 | 0 / 0 |
| Snapshots | 0 | 0 |
| Instrumented source files | 24 | 24 |
| Statements | 327 / 336 (97.32%) | 327 / 336 (97.32%) |
| Branches | 87 / 98 (88.77%) | 87 / 98 (88.77%) |
| Functions | 75 / 78 (96.15%) | 75 / 78 (96.15%) |
| Lines | 268 / 277 (96.75%) | 268 / 277 (96.75%) |
| Exit code | 0 | 0 |

The reusable corpus comparator found exact suite paths, exact test identities
and statuses, exact snapshot totals, zero Rjest file errors, and exact aggregate
and per-file Istanbul summary parity across all 24 source files.

The official serial measurement reported 6.154 seconds (6.50 seconds wall and
477,249,536-byte peak RSS). The serial Rjest measurement reported 38.892
seconds (39.71 seconds wall and 677,756,928-byte peak RSS). Rjest was 6.32 times
slower by reported runner time, 6.11 times slower by wall time, and used 1.42
times the peak RSS in these single measurements. This is compatibility
evidence, not a benchmark win; fresh Node/JSDOM/ts-jest startup per file remains
the leading performance target.

## Commands

The checkout and machine-readable results live under ignored `base/corpus`:

```sh
cd base/corpus/amplify-js
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/api-rest test
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/api-rest run jest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-api-rest/official-node24.json
cd packages/api-rest
CI=true npm exec --yes --package=node@24 -- \
  ../../../../../target/debug/rjest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-api-rest/rjest-first-node24.json
cd ../../../../..
npm run compare:corpus -- \
  --root base/corpus/amplify-js/packages/api-rest \
  base/corpus/results/amplify-api-rest/official-node24.json \
  base/corpus/results/amplify-api-rest/rjest-first-node24.json
```

## Compatibility result

The first rebuilt Rjest diagnostic passed the complete behavioral and coverage
surface, so no runtime change was needed for this package. The versioned
differential denominator remains 55/55 scenarios; this real-project result is
independent evidence and does not inflate that score. It proves parity for this
pinned API REST package only; other Amplify packages and unrelated Jest
projects remain separate corpus work.
