# AWS Amplify API compatibility corpus

AWS Amplify JS is the pinned Yarn-workspace monorepo corpus used to test Rjest
against unchanged package suites after the repository's production build. The
aggregate API package is the ninth package with a strict machine comparison
from this checkout.

## Reproduction target

- Repository: <https://github.com/aws-amplify/amplify-js>
- Commit: `36e3ce19983925ee6a68b75ebd9a01a95100989b`
- Lockfile SHA-256: `6308d9264f5139363854e7cd04e891d30101ef6cbb625a7e3bdb32d9f51cf6ec`
- Install command: `yarn install --frozen-lockfile`
- Build command: `yarn build`
- Runtime: Node 24.20.0 and Yarn 1.22.22
- Package: `@aws-amplify/api` 6.3.29
- Locked Jest: 29.7.0
- Locked ts-jest: 29.4.0
- Locked TypeScript: 5.8.3

The checkout, tests, Jest configuration, and lockfile remain unmodified. The
original package command passed ESLint and its 88% TypeScript coverage gate at
159/159 declarations (100%), then passed both Jest suites and all 86 tests.
Jest reported 21.934 seconds on that cold package run; the complete command took
28.01 seconds wall time and reached a 1,195,900,928-byte peak RSS.

This package exercises the built workspace's GraphQL and Adapter Next.js entry
points, SSR clients, package exports, factory mocks, function and deep method
spies, `jest.clearAllMocks`, fetch mocks, Observables, auth-mode branching, and
JSDOM. Its configured Istanbul run collects no source files under either runner
because the tests execute the already-built workspace packages; the comparator
therefore records an exact empty coverage map rather than presenting 100% as
meaningful source coverage.

## Exact result

| Measurement | Official Jest | Rjest |
| --- | ---: | ---: |
| Discovered suites | 2 | 2 |
| Passing suites | 2 | 2 |
| Registered tests | 86 | 86 |
| Passing tests | 86 | 86 |
| Skipped / todo tests | 0 / 0 | 0 / 0 |
| Snapshots | 0 | 0 |
| Instrumented source files | 0 | 0 |
| Statements | 0 / 0 | 0 / 0 |
| Branches | 0 / 0 | 0 / 0 |
| Functions | 0 / 0 | 0 / 0 |
| Lines | 0 / 0 | 0 / 0 |
| Exit code | 0 | 0 |

The reusable corpus comparator found exact suite paths, exact test identities
and statuses, exact snapshot totals, zero Rjest file errors, and matching empty
coverage maps.

The warm official serial measurement reported 2.632 seconds (3.03 seconds wall
and 530,284,544-byte peak RSS). The serial Rjest measurement reported 26.104
seconds (26.18 seconds wall and 1,016,168,448-byte peak RSS). Rjest was 9.92
times slower by reported runner time, 8.64 times slower by wall time, and used
1.92 times the peak RSS in these single measurements. This is compatibility
evidence, not a benchmark win; fresh Node/JSDOM/ts-jest startup per file remains
the leading performance target.

## Commands

The checkout and machine-readable results live under ignored `base/corpus`:

```sh
cd base/corpus/amplify-js
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/api test
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/api run jest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-api/official-node24.json
cd packages/api
CI=true npm exec --yes --package=node@24 -- \
  ../../../../../target/debug/rjest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-api/rjest-first-node24.json
cd ../../../../..
npm run compare:corpus -- \
  --root base/corpus/amplify-js/packages/api \
  base/corpus/results/amplify-api/official-node24.json \
  base/corpus/results/amplify-api/rjest-first-node24.json
```

## Compatibility result

The first Rjest diagnostic matched the complete behavioral surface, so no
runtime change was needed for this package. The versioned differential
denominator remains 55/55 scenarios; this real-project result is independent
evidence and does not inflate that score. It proves parity for this pinned API
package only; API GraphQL's delayed cleanup coverage difference and other
unmeasured projects remain separate work.
