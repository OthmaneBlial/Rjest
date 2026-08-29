# AWS Amplify Analytics compatibility corpus

AWS Amplify JS is the Yarn-workspace monorepo corpus used to test Rjest against
an unchanged package suite after the repository's real production build.

## Reproduction target

- Repository: <https://github.com/aws-amplify/amplify-js>
- Commit: `36e3ce19983925ee6a68b75ebd9a01a95100989b`
- Lockfile SHA-256: `6308d9264f5139363854e7cd04e891d30101ef6cbb625a7e3bdb32d9f51cf6ec`
- Install command: `yarn install --frozen-lockfile`
- Build command: `yarn build`
- Runtime: Node 24.20.0 and Yarn 1.22.22
- Package: `@aws-amplify/analytics` 7.1.0
- Locked Jest: 29.7.0
- Locked ts-jest: 29.4.0
- Locked TypeScript: 5.8.3

The checkout, tests, Jest configuration, and lockfile remain unmodified. The
full monorepo build completed all 20 tasks and its duplicate-dependency check in
96.75 seconds wall time with 820,346,880-byte peak RSS. The Analytics package
uses inherited executable configuration, `setupFiles`, JSDOM, `ts-jest`,
workspace package imports, automatic mocks, `jest.isolateModules`, callback and
promise scheduling, coverage thresholds, and heap reporting.

## Exact result

| Measurement | Official Jest | Rjest |
| --- | ---: | ---: |
| Discovered suites | 30 | 30 |
| Passing suites | 30 | 30 |
| Registered tests | 111 | 111 |
| Passing tests | 111 | 111 |
| Skipped / todo tests | 0 | 0 |
| Snapshots | 0 | 0 |
| Instrumented source files | 58 | 58 |
| Statements | 665 / 872 (76.26%) | 665 / 872 (76.26%) |
| Branches | 103 / 187 (55.08%) | 103 / 187 (55.08%) |
| Functions | 146 / 223 (65.47%) | 146 / 223 (65.47%) |
| Lines | 578 / 779 (74.19%) | 578 / 779 (74.19%) |
| Exit code | 0 | 0 |

An automated comparison of the captured Istanbul maps found exact aggregate
and per-file coverage-summary parity across all 58 files. It also found exact
test-name and status parity for all 111 tests.

The official serial measurement reported 7.357 seconds (10.30 seconds wall and
779,059,200-byte peak RSS). The final serial Rjest measurement reported 141.882
seconds (144.82 seconds wall and 713,359,360-byte peak RSS). Rjest currently
starts a fresh Node/JSDOM/ts-jest process for every file, so this corpus makes
worker startup and transformer reuse an obvious future optimization target.
These are single compatibility measurements, not a repeated benchmark.

## Commands

The checkout and machine-readable results live under ignored `base/corpus`:

```sh
git clone https://github.com/aws-amplify/amplify-js.git base/corpus/amplify-js
git -C base/corpus/amplify-js checkout \
  36e3ce19983925ee6a68b75ebd9a01a95100989b
cd base/corpus/amplify-js
npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn install --frozen-lockfile
npm exec --yes --package=node@24 --package=yarn@1.22.22 -- yarn build
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/analytics run jest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-analytics/official-node24.json
cd packages/analytics
CI=true npm exec --yes --package=node@24 -- \
  ../../../../../target/debug/rjest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-analytics/rjest-final-node24.json
```

## Compatibility work exposed by this corpus

The first Rjest attempt stopped at configuration because `setupFiles` and
`workerIdleMemoryLimit` were rejected. After configuration support, the first
executable diagnostic discovered all 30 suites but only registered 50 of 111
tests; 37 passed. Preserved fixes then added:

- Jest's distinct pre-framework `setupFiles` lifecycle and normalized
  `workerIdleMemoryLimit` handling for Rjest's one-process-per-file model;
- exact unanchored `moduleNameMapper` substitution semantics;
- `jest.isolateModules` CommonJS registry isolation;
- automatic mocks for inherited methods and getter-exported module surfaces;
- live JSDOM storage globals when `window.sessionStorage` is redefined;
- Jest-compatible `-w` and functional `--logHeapUsage` CLI flags.

The versioned differential corpus grew from 49 to 52 scenarios, with existing
environment and resolver probes strengthened as well. The result proves parity
for this pinned Analytics suite; other Amplify packages remain separate corpus
work.
