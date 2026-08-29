# AWS Amplify DataStore compatibility corpus

AWS Amplify JS is the Yarn-workspace monorepo corpus used to test Rjest against
unchanged package suites after the repository's production build. DataStore is
the fifth package measured from the same pinned checkout.

## Reproduction target

- Repository: <https://github.com/aws-amplify/amplify-js>
- Commit: `36e3ce19983925ee6a68b75ebd9a01a95100989b`
- Lockfile SHA-256: `6308d9264f5139363854e7cd04e891d30101ef6cbb625a7e3bdb32d9f51cf6ec`
- Install command: `yarn install --frozen-lockfile`
- Build command: `yarn build`
- Runtime: Node 24.20.0 and Yarn 1.22.22
- Package: `@aws-amplify/datastore` 5.1.10
- Locked Jest: 29.7.0
- Locked ts-jest: 29.4.0
- Locked TypeScript: 5.8.3

The checkout, tests, Jest configuration, and lockfile remain unmodified. The
original package health command passed ESLint with one warning and its 92.05%
TypeScript coverage gate at 16,358/17,242 declarations (94.87%), then passed
all 33 Jest suites, 1,160 tests with 14 skipped tests, and 8 snapshots. Jest
reported 154.024 seconds within that complete command; the full command took
165.85 seconds wall time and reached 1,127,809,024-byte peak RSS.

DataStore exercises inherited executable configuration, `ts-jest`, TSX,
JSDOM, fake IndexedDB, Dexie mapping, RxJS scheduling, `expect.getState()`,
cross-realm browser constructors, snapshots, coverage thresholds, and heap
reporting.

## Exact result

| Measurement | Official Jest | Rjest |
| --- | ---: | ---: |
| Discovered suites | 33 | 33 |
| Passing suites | 33 | 33 |
| Registered tests | 1,174 | 1,174 |
| Passing tests | 1,160 | 1,160 |
| Skipped / todo tests | 14 / 0 | 14 / 0 |
| Snapshots | 8 | 8 |
| Instrumented source files | 29 | 29 |
| Statements | 3,659 / 4,061 (90.10%) | 3,659 / 4,061 (90.10%) |
| Branches | 1,360 / 1,641 (82.87%) | 1,360 / 1,641 (82.87%) |
| Functions | 772 / 818 (94.37%) | 772 / 818 (94.37%) |
| Lines | 3,557 / 3,944 (90.18%) | 3,557 / 3,944 (90.18%) |
| Exit code | 0 | 0 |

The reusable corpus comparator found exact suite paths, exact identities and
statuses for all 1,160 executed tests, equal per-file skipped-test counts, exact
snapshot counts, no Rjest file errors, and exact aggregate and per-file
Istanbul summary parity across all 29 source files.

The suite defines 12 tests inside a skipped fuzz block using `Math.random()` in
their names. Independent official Jest and Rjest processes therefore cannot
produce identical labels for those tests even though neither runner executes
them. The default comparator remains strict and reports that name difference.
This corpus uses the explicit `--compare-skipped-by-file-count` policy, which
still requires exact executed identities and statuses and exact skipped counts
per file. Comparator regression tests prove that the policy does not tolerate
an executed-name mismatch or a skipped-count mismatch.

The official serial measurement reported 93.985 seconds (97.03 seconds wall
and 1,072,152,576-byte peak RSS). The final serial Rjest coverage measurement
reported 391.987 seconds (392.50 seconds wall and 1,131,134,976-byte peak RSS).
Rjest was 4.17 times slower by reported runner time and 4.05 times slower by
wall time in these single measurements. This is compatibility evidence, not a
benchmark win; fresh Node/JSDOM/ts-jest startup per file remains the leading
performance target.

## Commands

The checkout and machine-readable results live under ignored `base/corpus`:

```sh
cd base/corpus/amplify-js
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/datastore test
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/datastore run jest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-datastore/official-node24.json
cd packages/datastore
CI=true npm exec --yes --package=node@24 -- \
  ../../../../../target/debug/rjest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-datastore/rjest-node24.json
cd ../../../../..
npm run compare:corpus -- \
  --root base/corpus/amplify-js/packages/datastore \
  --compare-skipped-by-file-count \
  base/corpus/results/amplify-datastore/official-node24.json \
  base/corpus/results/amplify-datastore/rjest-node24.json
```

## Compatibility work exposed by this corpus

The first Rjest diagnostic discovered all 33 suite paths but registered only
852 of 1,174 tests. It passed 706, failed 132, skipped 14, matched 6 snapshots,
and recorded 61 file errors. Two root causes dominated:

- `expect.getState()` was absent, so the common adapter helper failed while
  defining two large suites;
- fake-indexeddb assigned constructors such as `IDBRequest` and
  `IDBTransaction` to `window`, but Rjest did not keep their bare JSDOM globals
  live.

Rjest now exposes mutable Jest-style expectation state, including the current
test name, test path, assertion count, and assertion requirements. All standard
fake-indexeddb constructor bindings remain linked to their JSDOM window
properties. Four focused DataStore files then passed 359/359 tests unchanged.

The next full parallel diagnostic registered all 1,174 tests and matched all 8
snapshots. It left two 5-second timeouts caused by eight memory-heavy workers
contending on a suite whose own command requires `-w 1`, plus two file errors
from RxJS callbacks scheduled after type-only tests. Official Jest tears the
JSDOM environment down without draining an extra event-loop turn between those
tests. Rjest removed its extra turn, and a differential fixture now preserves
the pending-callback teardown behavior. Both affected type-only suites pass.

The final serial behavior and coverage runs pass the unchanged corpus. The
versioned differential corpus remains 53/53 scenarios, with its expectation
state and JSDOM lifecycle/global probes strengthened. The result proves parity
for this pinned DataStore package; other Amplify packages remain separate
corpus work.
