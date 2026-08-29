# AWS Amplify Adapter Next.js compatibility corpus

AWS Amplify JS is the Yarn-workspace monorepo corpus used to test Rjest against
unchanged package suites after the repository's production build. Adapter
Next.js is the seventh package measured from the same pinned checkout.

## Reproduction target

- Repository: <https://github.com/aws-amplify/amplify-js>
- Commit: `36e3ce19983925ee6a68b75ebd9a01a95100989b`
- Lockfile SHA-256: `6308d9264f5139363854e7cd04e891d30101ef6cbb625a7e3bdb32d9f51cf6ec`
- Install command: `yarn install --frozen-lockfile`
- Build command: `yarn build`
- Runtime: Node 24.20.0 and Yarn 1.22.22
- Package: `@aws-amplify/adapter-nextjs` 1.7.3
- Locked Jest: 29.7.0
- Locked ts-jest: 29.4.0
- Locked TypeScript: 5.8.3

The checkout, tests, Jest configuration, and lockfile remain unmodified. The
original package health command passed ESLint and its 90.31% TypeScript
coverage gate at 2,892/2,893 declarations (99.97%), then passed all 41 Jest
suites, 300 tests with one skipped test, and one snapshot. Jest reported
47.597 seconds within that complete command; the full command took 56.58
seconds wall time and reached 968,605,696-byte peak RSS.

Adapter Next.js exercises inherited executable configuration, `ts-jest`, a
Node environment, Next.js request/response and cookie contracts, package
exports, automatic and factory mocks, `jest.mocked`, `jest.doMock`,
`jest.resetModules`, accessor spies, snapshots, coverage thresholds, and heap
reporting.

## Exact result

| Measurement | Official Jest | Rjest |
| --- | ---: | ---: |
| Discovered suites | 41 | 41 |
| Passing suites | 41 | 41 |
| Registered tests | 301 | 301 |
| Passing tests | 300 | 300 |
| Skipped / todo tests | 1 / 0 | 1 / 0 |
| Snapshots | 1 | 1 |
| Instrumented source files | 50 | 50 |
| Statements | 767 / 769 (99.73%) | 767 / 769 (99.73%) |
| Branches | 194 / 194 (100%) | 194 / 194 (100%) |
| Functions | 164 / 167 (98.20%) | 164 / 167 (98.20%) |
| Lines | 683 / 685 (99.70%) | 683 / 685 (99.70%) |
| Exit code | 0 | 0 |

The reusable corpus comparator found exact suite paths, exact test identities
and statuses, exact snapshot counts, no Rjest file errors, and exact aggregate
and per-file Istanbul summary parity across all 50 source files.

The official serial measurement reported 7.470 seconds (8.50 seconds wall and
745,439,232-byte peak RSS). The final serial Rjest measurement reported
267.304 seconds (267.44 seconds wall and 990,642,176-byte peak RSS). Rjest was
35.78 times slower by reported runner time and 31.46 times slower by wall time
in these single measurements. This is compatibility evidence, not a benchmark
win; fresh Node/ts-jest startup per file remains the leading performance
target.

## Commands

The checkout and machine-readable results live under ignored `base/corpus`:

```sh
cd base/corpus/amplify-js
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/adapter-nextjs test
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/adapter-nextjs run jest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-adapter-nextjs/official-node24.json
cd packages/adapter-nextjs
CI=true npm exec --yes --package=node@24 -- \
  ../../../../../target/debug/rjest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-adapter-nextjs/rjest-node24.json
cd ../../../../..
npm run compare:corpus -- \
  --root base/corpus/amplify-js/packages/adapter-nextjs \
  base/corpus/results/amplify-adapter-nextjs/official-node24.json \
  base/corpus/results/amplify-adapter-nextjs/rjest-node24.json
```

## Compatibility result

The first Rjest diagnostic passed the complete behavior surface: 41/41 suites,
300 passing tests, one skipped test, and one snapshot. This is significant
composition evidence for module mocking and registry behavior because the
suite combines automatic mocks, factory mocks, repeated `doMock` calls,
`resetModules`, `jest.mocked`, accessor spies, and Next.js package exports.

The final serial run retained exact behavior and produced exact aggregate and
per-file coverage summaries. No Rjest runtime change was needed for this
package. The versioned differential denominator remains 54/54 scenarios; this
real-project result is independent evidence and does not inflate that score.
The result proves parity for this pinned Adapter Next.js package; other
Amplify packages remain separate corpus work.
