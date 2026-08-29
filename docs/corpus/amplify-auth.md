# AWS Amplify Auth compatibility corpus

AWS Amplify JS is the Yarn-workspace monorepo corpus used to test Rjest against
unchanged package suites after the repository's production build. Auth is the
third package measured from the same pinned checkout and the largest so far by
test count.

## Reproduction target

- Repository: <https://github.com/aws-amplify/amplify-js>
- Commit: `36e3ce19983925ee6a68b75ebd9a01a95100989b`
- Lockfile SHA-256: `6308d9264f5139363854e7cd04e891d30101ef6cbb625a7e3bdb32d9f51cf6ec`
- Install command: `yarn install --frozen-lockfile`
- Build command: `yarn build`
- Runtime: Node 24.20.0 and Yarn 1.22.22
- Package: `@aws-amplify/auth` 6.20.0
- Locked Jest: 29.7.0
- Locked ts-jest: 29.4.0
- Locked TypeScript: 5.8.3

The checkout, tests, Jest configuration, and lockfile remain unmodified. The
original package health command passed ESLint, reported 94.72% TypeScript
coverage against its 91.18% gate, and passed all 101 Jest suites and 1,150
tests. That complete workspace command reported 87.717 seconds for Jest, took
103.11 seconds wall time, and reached 1,337,049,088-byte peak RSS.

Auth exercises inherited executable configuration, `ts-jest`, JSDOM,
WebAuthn-facing APIs, getter-backed TypeScript barrel exports, legacy Jest 29
mock APIs, isolated and automatic CommonJS mocks, OAuth state, crypto/SRP code,
coverage thresholds, and heap reporting.

## Exact result

| Measurement | Official Jest | Rjest |
| --- | ---: | ---: |
| Discovered suites | 101 | 101 |
| Passing suites | 101 | 101 |
| Registered tests | 1,150 | 1,150 |
| Passing tests | 1,150 | 1,150 |
| Skipped / todo tests | 0 | 0 |
| Snapshots | 0 | 0 |
| Instrumented source files | 198 | 198 |
| Statements | 3,878 / 4,190 (92.55%) | 3,878 / 4,190 (92.55%) |
| Branches | 662 / 848 (78.06%) | 662 / 848 (78.06%) |
| Functions | 497 / 589 (84.38%) | 497 / 589 (84.38%) |
| Lines | 3,624 / 3,902 (92.87%) | 3,624 / 3,902 (92.87%) |
| Exit code | 0 | 0 |

The reusable corpus comparator found exact suite-path parity, exact test-name
and status parity for all 1,150 tests, exact snapshot counts, no Rjest file
errors, and exact aggregate and per-file Istanbul summary parity across all 198
source files.

The official serial measurement reported 28.243 seconds (31.33 seconds wall
and 768,770,048-byte peak RSS). The final serial Rjest measurement reported
559.973 seconds (562.98 seconds wall and 1,048,428,544-byte peak RSS). Rjest was
19.83 times slower by reported runner time and 17.97 times slower by wall time
in these single measurements. This is compatibility evidence, not a benchmark
win; fresh Node/JSDOM/ts-jest startup per file remains the leading performance
target.

## Commands

The checkout and machine-readable results live under ignored `base/corpus`:

```sh
cd base/corpus/amplify-js
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/auth test
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/auth run jest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-auth/official-node24.json
cd packages/auth
CI=true npm exec --yes --package=node@24 -- \
  ../../../../../target/debug/rjest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-auth/rjest-final-node24.json
cd ../../../../..
npm run compare:corpus -- \
  --root base/corpus/amplify-js/packages/auth \
  base/corpus/results/amplify-auth/official-node24.json \
  base/corpus/results/amplify-auth/rjest-final-node24.json
```

## Compatibility work exposed by this corpus

The first Rjest diagnostic discovered 101 suites but passed only 97 of them,
registering 1,144 of the expected 1,150 tests. It passed 1,141 tests and failed
three. Preserved fixes then added:

- Jest 29's legacy `jest.genMockFromModule` alias alongside
  `jest.createMockFromModule`;
- ordinary `jest.spyOn` replacement and restoration for getter-backed function
  exports;
- isolated module and mock registries while evaluating automatic-mock metadata,
  without discarding the coverage that Jest records for that evaluation;
- JSDOM isolation from Node-only `TextEncoder` and `TextDecoder` globals when
  the installed JSDOM window does not provide them.

After all tests passed, the strict coverage comparison still found three files
with extra execution in Rjest. A focused oracle showed that official Jest's
JSDOM throws when the Auth path reaches the absent `TextEncoder`, while Rjest's
leaked Node global incorrectly continued through two crypto helpers. The
environment regression probe preserves that distinction, and the corrected
serial run produces exact per-file parity.

The versioned differential corpus remains 53/53 scenarios, with its automock,
coverage, and JSDOM probes strengthened. The result proves parity for this
pinned Auth package; other Amplify packages remain separate corpus work.
