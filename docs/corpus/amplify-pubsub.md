# AWS Amplify PubSub compatibility corpus

AWS Amplify JS is the pinned Yarn-workspace monorepo corpus used to test Rjest
against unchanged package suites after the repository's production build.
PubSub is the tenth package with a strict machine comparison from this checkout.

## Reproduction target

- Repository: <https://github.com/aws-amplify/amplify-js>
- Commit: `36e3ce19983925ee6a68b75ebd9a01a95100989b`
- Lockfile SHA-256: `6308d9264f5139363854e7cd04e891d30101ef6cbb625a7e3bdb32d9f51cf6ec`
- Install command: `yarn install --frozen-lockfile`
- Build command: `yarn build`
- Runtime: Node 24.20.0 and Yarn 1.22.22
- Package: `@aws-amplify/pubsub` 6.1.70
- Locked Jest: 29.7.0
- Locked ts-jest: 29.4.0
- Locked TypeScript: 5.8.3

The checkout, tests, Jest configuration, and lockfile remain unmodified. The
original package command passed ESLint and its 93% TypeScript coverage gate at
1,057/1,060 declarations (99.72%), then passed its Jest suite and all 17 tests.
Jest reported 5.226 seconds within that complete command; the command took
10.97 seconds wall time and reached a 700,563,456-byte peak RSS.

PubSub exercises inherited executable configuration, `ts-jest`, JSDOM, a
resolved `moduleNameMapper` target, AWS IoT and MQTT-over-WebSocket providers,
MQTT topic wildcards, Observables, connection-state transitions, network loss
and recovery, reconnection timers, multiple observers, automatic/factory mocks,
and coverage of a large vendored Paho MQTT JavaScript implementation.

## Exact result

| Measurement | Official Jest | Rjest |
| --- | ---: | ---: |
| Discovered suites | 1 | 1 |
| Passing suites | 1 | 1 |
| Registered tests | 17 | 17 |
| Passing tests | 17 | 17 |
| Skipped / todo tests | 0 / 0 | 0 / 0 |
| Snapshots | 0 | 0 |
| Instrumented source files | 14 | 14 |
| Statements | 392 / 1,381 (28.38%) | 392 / 1,381 (28.38%) |
| Branches | 82 / 498 (16.46%) | 82 / 498 (16.46%) |
| Functions | 82 / 200 (41%) | 82 / 200 (41%) |
| Lines | 371 / 1,312 (28.27%) | 371 / 1,312 (28.27%) |
| Exit code | 0 | 0 |

The reusable corpus comparator found exact suite paths, exact test identities
and statuses, exact snapshot totals, zero Rjest file errors, and exact aggregate
and per-file Istanbul summary parity across all 14 source files.

The warm official serial measurement reported 2.098 seconds (2.43 seconds wall
and 420,724,736-byte peak RSS). The serial Rjest measurement reported 4.615
seconds (4.76 seconds wall and 690,978,816-byte peak RSS). Rjest was 2.20 times
slower by reported runner time, 1.96 times slower by wall time, and used 1.64
times the peak RSS in these single measurements. This is compatibility evidence,
not a benchmark win.

## Commands

The checkout and machine-readable results live under ignored `base/corpus`:

```sh
cd base/corpus/amplify-js
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/pubsub test
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/pubsub run jest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-pubsub/official-node24.json
cd packages/pubsub
CI=true npm exec --yes --package=node@24 -- \
  ../../../../../target/debug/rjest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-pubsub/rjest-first-node24.json
cd ../../../../..
npm run compare:corpus -- \
  --root base/corpus/amplify-js/packages/pubsub \
  base/corpus/results/amplify-pubsub/official-node24.json \
  base/corpus/results/amplify-pubsub/rjest-first-node24.json
```

## Compatibility result

The first Rjest diagnostic matched the complete behavioral and coverage
surface, so no runtime change was needed for this package. The versioned
differential denominator remains 55/55 scenarios; this real-project result is
independent evidence and does not inflate that score. It proves parity for this
pinned PubSub package only. API GraphQL's delayed cleanup coverage difference
therefore remains a localized open result rather than evidence of a general
WebSocket or reconnection incompatibility.
