# AWS Amplify Notifications compatibility corpus

AWS Amplify JS is the Yarn-workspace monorepo corpus used to test Rjest against
unchanged package suites after the repository's production build.
Notifications is the sixth package measured from the same pinned checkout.

## Reproduction target

- Repository: <https://github.com/aws-amplify/amplify-js>
- Commit: `36e3ce19983925ee6a68b75ebd9a01a95100989b`
- Lockfile SHA-256: `6308d9264f5139363854e7cd04e891d30101ef6cbb625a7e3bdb32d9f51cf6ec`
- Install command: `yarn install --frozen-lockfile`
- Build command: `yarn build`
- Runtime: Node 24.20.0 and Yarn 1.22.22
- Package: `@aws-amplify/notifications` 2.1.0
- Locked Jest: 29.7.0
- Locked ts-jest: 29.4.0
- Locked TypeScript: 5.8.3

The checkout, tests, Jest configuration, and lockfile remain unmodified. The
original package health command passed ESLint with 26 deprecation/JSDoc
warnings and no errors, then passed its 88.21% TypeScript coverage gate at
3,397/3,429 declarations (99.07%). Official Jest passed all 61 suites and 261
tests with no snapshots. Jest reported 24.675 seconds within that complete
command; the full command took 33.86 seconds wall time and reached
831,520,768-byte peak RSS.

Notifications exercises inherited executable configuration, `ts-jest`,
JSDOM, per-file Node environment docblocks, React Native source branches,
manual and factory mocks, signed requests, event listeners, Pinpoint in-app
messaging, coverage thresholds, and heap reporting.

## Exact result

| Measurement | Official Jest | Rjest |
| --- | ---: | ---: |
| Discovered suites | 61 | 61 |
| Passing suites | 61 | 61 |
| Registered tests | 261 | 261 |
| Passing tests | 261 | 261 |
| Skipped / todo tests | 0 / 0 | 0 / 0 |
| Snapshots | 0 | 0 |
| Instrumented source files | 90 | 90 |
| Statements | 1,108 / 1,172 (94.53%) | 1,108 / 1,172 (94.53%) |
| Branches | 165 / 210 (78.57%) | 165 / 210 (78.57%) |
| Functions | 277 / 301 (92.02%) | 277 / 301 (92.02%) |
| Lines | 975 / 1,038 (93.93%) | 975 / 1,038 (93.93%) |
| Exit code | 0 | 0 |

The reusable corpus comparator found exact suite paths, exact test identities
and statuses, exact snapshot counts, no Rjest file errors, and exact aggregate
and per-file Istanbul summary parity across all 90 source files.

The official serial measurement reported 8.377 seconds (9.42 seconds wall and
739,721,216-byte peak RSS). The final serial Rjest measurement reported
250.867 seconds (251.05 seconds wall and 824,426,496-byte peak RSS). Rjest was
29.95 times slower by reported runner time and 26.65 times slower by wall time
in these single measurements. This is compatibility evidence, not a benchmark
win; fresh Node/JSDOM/ts-jest startup per file remains the leading performance
target.

## Commands

The checkout and machine-readable results live under ignored `base/corpus`:

```sh
cd base/corpus/amplify-js
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/notifications test
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/notifications run jest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-notifications/official-node24.json
cd packages/notifications
CI=true npm exec --yes --package=node@24 -- \
  ../../../../../target/debug/rjest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-notifications/rjest-node24.json
cd ../../../../..
npm run compare:corpus -- \
  --root base/corpus/amplify-js/packages/notifications \
  base/corpus/results/amplify-notifications/official-node24.json \
  base/corpus/results/amplify-notifications/rjest-node24.json
```

## Compatibility work exposed by this corpus

The first Rjest diagnostic registered all 261 tests and passed 60 of 61 suites,
with 252 passing and 9 failing tests. Every failure came from
`helpers.native.test.ts`, which declares `@jest-environment node` while the
repository configuration defaults to JSDOM. Rjest ignored the per-file
docblock, so browser globals remained present and platform detection selected
the `Web` message overrides instead of Android, iOS, or default native values.

Rjest now parses Jest docblock pragmas before configuring transforms and the
test environment. `@jest-environment` overrides the project environment per
file, and JSON from `@jest-environment-options` is merged over project options.
The differential fixture proves a configured JSDOM default, a Node override,
and a docblock JSDOM URL override against official Jest. The previously failing
Notifications file then passed 9/9 tests unchanged.

The final serial behavior and coverage run passes the complete unchanged
corpus. The versioned differential denominator is now 54/54 scenarios, with
the new environment-docblock scenario counted in the Environment category.
The result proves parity for this pinned Notifications package; other Amplify
packages remain separate corpus work.
