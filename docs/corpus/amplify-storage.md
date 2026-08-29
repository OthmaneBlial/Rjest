# AWS Amplify Storage compatibility corpus

AWS Amplify JS is the Yarn-workspace monorepo corpus used to test Rjest against
unchanged package suites after the repository's production build. Storage is
the fourth package measured from the same pinned checkout.

## Reproduction target

- Repository: <https://github.com/aws-amplify/amplify-js>
- Commit: `36e3ce19983925ee6a68b75ebd9a01a95100989b`
- Lockfile SHA-256: `6308d9264f5139363854e7cd04e891d30101ef6cbb625a7e3bdb32d9f51cf6ec`
- Install command: `yarn install --frozen-lockfile`
- Build command: `yarn build`
- Runtime: Node 24.20.0 and Yarn 1.22.22
- Package: `@aws-amplify/storage` 6.16.0
- Locked Jest: 29.7.0
- Locked ts-jest: 29.4.0
- Locked TypeScript: 5.8.3

The checkout, tests, Jest configuration, and lockfile remain unmodified. The
original package health command passed ESLint and its 90.31% TypeScript
coverage gate, then passed all 85 Jest suites and 850 tests. Jest reported
54.146 seconds within that complete command; the full command took 68.33
seconds wall time and reached 2,018,181,120-byte peak RSS.

Storage exercises inherited executable configuration, `ts-jest`, JSDOM,
mutable browser constructors, cross-realm buffers, custom asynchronous
matchers, asymmetric thrown-error expectations, XHR event mocking, multipart
state machines, coverage thresholds, and heap reporting.

## Exact result

| Measurement | Official Jest | Rjest |
| --- | ---: | ---: |
| Discovered suites | 85 | 85 |
| Passing suites | 85 | 85 |
| Registered tests | 850 | 850 |
| Passing tests | 850 | 850 |
| Skipped / todo tests | 0 | 0 |
| Snapshots | 0 | 0 |
| Instrumented source files | 129 | 129 |
| Statements | 2,165 / 2,242 (96.56%) | 2,165 / 2,242 (96.56%) |
| Branches | 592 / 675 (87.70%) | 592 / 675 (87.70%) |
| Functions | 405 / 437 (92.67%) | 405 / 437 (92.67%) |
| Lines | 2,002 / 2,077 (96.38%) | 2,002 / 2,077 (96.38%) |
| Exit code | 0 | 0 |

The reusable corpus comparator found exact suite-path parity, exact test-name
and status parity for all 850 tests, exact snapshot counts, no Rjest file
errors, and exact aggregate and per-file Istanbul summary parity across all 129
source files.

The official serial measurement reported 27.436 seconds (30.69 seconds wall
and 1,643,347,968-byte peak RSS). The final serial Rjest measurement reported
402.438 seconds (404.79 seconds wall and 1,973,436,416-byte peak RSS). Rjest was
14.67 times slower by reported runner time and 13.19 times slower by wall time
in these single measurements. This is compatibility evidence, not a benchmark
win; fresh Node/JSDOM/ts-jest startup per file remains the leading performance
target.

## Commands

The checkout and machine-readable results live under ignored `base/corpus`:

```sh
cd base/corpus/amplify-js
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/storage test
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/storage run jest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-storage/official-node24.json
cd packages/storage
CI=true npm exec --yes --package=node@24 -- \
  ../../../../../target/debug/rjest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-storage/rjest-final-node24.json
cd ../../../../..
npm run compare:corpus -- \
  --root base/corpus/amplify-js/packages/storage \
  base/corpus/results/amplify-storage/official-node24.json \
  base/corpus/results/amplify-storage/rjest-final-node24.json
```

## Compatibility work exposed by this corpus

The first Rjest diagnostic discovered all 85 suites and registered all 850
tests, but passed only 74 suites and 624 tests. The 226 failures reduced to
three root causes:

- 191 failures from custom matchers returning promises, because Rjest required
  a synchronous `{pass, message}` result;
- 19 failures from `toThrow` expectations using asymmetric matchers or plain
  error-property objects;
- 16 failures because assignments to `window.XMLHttpRequest`, `FileReader`, or
  `ReadableStream` did not update their bare global aliases.

The preserved fixes await asynchronous custom matchers while retaining their
matcher context, compare thrown values against asymmetric and object
expectations, and keep mutable browser constructors linked to their JSDOM
window properties. The second diagnostic then passed all 850 tests.

The first serial coverage result still had one extra covered statement, branch,
and line in `src/providers/s3/utils/crc32.ts`. Official Jest keeps a
`node:util` `TextEncoder` buffer outside the JSDOM `ArrayBuffer` realm, while
Rjest had shared Node's constructor. Rjest now creates a separate JSDOM realm
for observable browser built-ins while preserving Node host intrinsics for
transformer tooling. The focused oracle and final 129-file comparison are
exact.

The versioned differential corpus remains 53/53 scenarios, with its custom
matcher and JSDOM probes strengthened. The result proves parity for this pinned
Storage package; other Amplify packages remain separate corpus work.
