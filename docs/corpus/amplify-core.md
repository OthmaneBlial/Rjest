# AWS Amplify Core compatibility corpus

AWS Amplify JS is the Yarn-workspace monorepo corpus used to test Rjest against
unchanged package suites after the repository's real production build. Core is
the second package measured from the same pinned checkout.

## Reproduction target

- Repository: <https://github.com/aws-amplify/amplify-js>
- Commit: `36e3ce19983925ee6a68b75ebd9a01a95100989b`
- Lockfile SHA-256: `6308d9264f5139363854e7cd04e891d30101ef6cbb625a7e3bdb32d9f51cf6ec`
- Install command: `yarn install --frozen-lockfile`
- Build command: `yarn build`
- Runtime: Node 24.20.0 and Yarn 1.22.22
- Package: `@aws-amplify/core` 6.18.0
- Locked Jest: 29.7.0
- Locked ts-jest: 29.4.0
- Locked TypeScript: 5.8.3

The checkout, tests, Jest configuration, and lockfile remain unmodified. The
frozen install and full 20-task monorepo build are recorded in the
[Analytics report](amplify-analytics.md). Core's original package health command
also passed its ESLint gate, reported 96.54% TypeScript coverage, and passed the
complete Jest suite.

Core exercises inherited executable configuration, pre-framework setup files,
JSDOM, `ts-jest`, workspace imports, browser-global spies, IndexedDB mocks,
circular DOM objects, asymmetric subset matchers, fake timers, external
snapshots, coverage thresholds, and heap reporting.

## Exact result

| Measurement | Official Jest | Rjest |
| --- | ---: | ---: |
| Discovered suites | 94 | 94 |
| Passing suites | 94 | 94 |
| Registered tests | 632 | 632 |
| Passing tests | 632 | 632 |
| Skipped / todo tests | 0 | 0 |
| Snapshots | 2 | 2 |
| Instrumented source files | 204 | 204 |
| Statements | 2,744 / 3,027 (90.65%) | 2,744 / 3,027 (90.65%) |
| Branches | 736 / 937 (78.54%) | 736 / 937 (78.54%) |
| Functions | 589 / 766 (76.89%) | 589 / 766 (76.89%) |
| Lines | 2,519 / 2,792 (90.22%) | 2,519 / 2,792 (90.22%) |
| Exit code | 0 | 0 |

The machine comparison found exact test-name and status parity for all 632
tests, exact snapshot counts, no Rjest file errors, and exact aggregate and
per-file Istanbul summary parity across all 204 source files.

The official serial measurement reported 14.777 seconds (18.01 seconds wall
and 748,699,648-byte peak RSS). The final serial Rjest measurement reported
285.930 seconds (288.36 seconds wall and 782,565,376-byte peak RSS). Rjest was
19.35 times slower by reported runner time and 16.01 times slower by wall time
in these single measurements. Its fresh Node/JSDOM/ts-jest process per file is
the leading optimization target; this is compatibility evidence, not a
benchmark win.

## Commands

The checkout and machine-readable results live under ignored `base/corpus`:

```sh
cd base/corpus/amplify-js
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/core test
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/core run jest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-core/official-node24.json
cd packages/core
CI=true npm exec --yes --package=node@24 -- \
  ../../../../../target/debug/rjest \
  -w 1 --coverage --logHeapUsage --json \
  --outputFile=../../../results/amplify-core/rjest-final-node24.json
```

## Compatibility work exposed by this corpus

The first Rjest diagnostic discovered all 94 suites and all 632 tests, with 613
tests passing and 19 failing across eight suites. The preserved fixes added:

- live JSDOM `window`, `self`, and `navigator` aliases plus dynamically assigned
  IndexedDB globals;
- cycle-safe asymmetric subset matching and inherited accessor lookup, covering
  identical `AbortSignal` objects and URL-like prototype properties;
- JSDOM initialization isolation from test-side global constructor mocks;
- Jest-major-aware empty-title result formatting for Jest 29 and Jest 30.

After those test failures were fixed, a second diagnostic exposed a
suite-level asynchronous JSDOM error despite 632 passing tests. The lifecycle
probe preserves that regression, and the final result requires zero file-level
errors rather than relying only on test counts.

The versioned differential corpus grew from 52 to 53 scenarios, with its Core,
Expect, and JSDOM probes strengthened. The result proves parity for this pinned
Core suite; other Amplify packages remain separate corpus work.
