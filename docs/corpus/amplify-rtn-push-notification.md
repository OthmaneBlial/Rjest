# AWS Amplify RTN Push Notification compatibility corpus

AWS Amplify JS is the pinned Yarn-workspace monorepo corpus used to test Rjest
against unchanged package suites after the repository's production build. The
React Native push-notification module adds native facade and event-listener
behavior in a JSDOM-configured TypeScript project.

## Reproduction target

- Repository: <https://github.com/aws-amplify/amplify-js>
- Commit: `36e3ce19983925ee6a68b75ebd9a01a95100989b`
- Lockfile SHA-256: `6308d9264f5139363854e7cd04e891d30101ef6cbb625a7e3bdb32d9f51cf6ec`
- Install command: `yarn install --frozen-lockfile`
- Build command: `yarn build`
- Runtime: Node 24.20.0 and Yarn 1.22.22
- Package: `@aws-amplify/rtn-push-notification` 1.3.1
- Locked Jest: 29.7.0
- Locked ts-jest: 29.4.0
- Locked TypeScript: 5.8.3

The checkout, tests, Jest configuration, and lockfile remain unmodified. The
package's original `test` command passed ESLint, its 99% TypeScript coverage
gate at 448/450 declarations (99.56%), and all 12 Jest suites. It exercises
inherited executable configuration, `ts-jest`, JSDOM, React Native module
facades, automatic and factory mocks, event subscriptions and cleanup,
permission normalization, headless tasks, coverage thresholds, and heap
reporting.

## Exact result

| Measurement | Official Jest | Rjest |
| --- | ---: | ---: |
| Discovered suites | 12 | 12 |
| Passing suites | 12 | 12 |
| Registered / passing tests | 28 / 28 | 28 / 28 |
| Skipped / todo tests | 0 / 0 | 0 / 0 |
| Snapshots | 0 | 0 |
| Instrumented source files | 13 | 13 |
| Statements | 103 / 103 (100%) | 103 / 103 (100%) |
| Branches | 36 / 38 (94.73%) | 36 / 38 (94.73%) |
| Functions | 26 / 26 (100%) | 26 / 26 (100%) |
| Lines | 90 / 90 (100%) | 90 / 90 (100%) |
| Exit code | 0 | 0 |

The reusable comparator found exact suite paths, exact test identities and
statuses, exact snapshot totals, zero Rjest file errors, and exact aggregate
and per-file Istanbul summary parity across all 13 source files.

The captured official serial run reported 1.852 seconds (4.98 seconds wall and
437,960,704-byte peak RSS). Rjest reported 23.697 seconds (25.94 seconds wall
and 561,250,304-byte peak RSS). Rjest was 12.80 times slower by reported runner
time, 5.21 times slower by wall time, and used 1.28 times the peak RSS in these
single measurements. This is compatibility evidence, not a controlled
benchmark.

## Commands

The checkout and machine-readable results live under ignored `base/corpus`:

```sh
cd base/corpus/amplify-js
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/rtn-push-notification test
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/rtn-push-notification run jest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-rtn-push-notification/official-node24.json
cd packages/rtn-push-notification
CI=true npm exec --yes --package=node@24 -- \
  ../../../../../target/debug/rjest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-rtn-push-notification/rjest-first-node24.json
cd ../../../../..
npm run compare:corpus -- \
  --root base/corpus/amplify-js/packages/rtn-push-notification \
  base/corpus/results/amplify-rtn-push-notification/official-node24.json \
  base/corpus/results/amplify-rtn-push-notification/rjest-first-node24.json
```

## Compatibility result

The first Rjest execution matched the full behavioral and coverage surface, so
no runtime change was needed for this package. This independent real-project
result does not inflate the bounded differential score.
