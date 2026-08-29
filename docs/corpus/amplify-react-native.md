# AWS Amplify React Native compatibility corpus

AWS Amplify JS is the pinned Yarn-workspace monorepo corpus used to test Rjest
against unchanged package suites after the repository's production build. React
Native is the twelfth package with a strict machine comparison from this
checkout.

## Reproduction target

- Repository: <https://github.com/aws-amplify/amplify-js>
- Commit: `36e3ce19983925ee6a68b75ebd9a01a95100989b`
- Lockfile SHA-256: `6308d9264f5139363854e7cd04e891d30101ef6cbb625a7e3bdb32d9f51cf6ec`
- Install command: `yarn install --frozen-lockfile`
- Build command: `yarn build`
- Runtime: Node 24.20.0 and Yarn 1.22.22
- Package: `@aws-amplify/react-native` 1.3.3
- Locked React Native: 0.72.17
- Locked Jest: 29.7.0
- Locked ts-jest: 29.4.0
- Locked TypeScript: 5.8.3

The checkout, tests, Jest configuration, and lockfile remain unmodified. The
original package command passed 4/4 suites and all 29 tests with no snapshots
and exit code zero. Jest reported 6.317 seconds within that command; the command
took 10.13 seconds wall time and reached a 530,399,232-byte peak RSS.

The suite exercises inherited executable configuration, `ts-jest`, JSDOM,
React Native platform and native-module facades, optional dependency loaders,
manual factory failures, `jest.doMock`, `jest.resetModules`, mock clearing,
proxies, and TypeScript module exports.

## Exact ordinary result

| Measurement | Official Jest | Rjest |
| --- | ---: | ---: |
| Discovered suites | 4 | 4 |
| Passing suites | 4 | 4 |
| Registered tests | 29 | 29 |
| Passing tests | 29 | 29 |
| Skipped / todo tests | 0 / 0 | 0 / 0 |
| Snapshots | 0 | 0 |
| Exit code | 0 | 0 |

The reusable corpus comparator found exact suite paths, exact test identities
and statuses, exact snapshot totals, and zero Rjest file errors. The warm
official serial measurement reported 1.687 seconds (5.08 seconds wall and a
418,775,040-byte peak RSS). Rjest reported 7.663 seconds (9.88 seconds wall and
a 525,647,872-byte peak RSS). Rjest was 4.54 times slower by reported runner
time, 1.94 times slower by wall time, and used 1.26 times the peak RSS in these
single measurements.

## Exact coverage diagnostic

The package's original `test` script does not enable coverage. Its Jest config
nonetheless defines 100% global coverage thresholds, while the current suite
covers less than 100%. Explicitly enabling coverage therefore produces exit
code one under official Jest. Rjest preserves that result rather than hiding or
overriding the upstream threshold:

| Measurement | Official Jest | Rjest |
| --- | ---: | ---: |
| Passing suites | 4 / 4 | 4 / 4 |
| Passing tests | 29 / 29 | 29 / 29 |
| Instrumented source files | 19 | 19 |
| Statements | 131 / 139 (94.24%) | 131 / 139 (94.24%) |
| Branches | 6 / 11 (54.54%) | 6 / 11 (54.54%) |
| Functions | 40 / 46 (86.95%) | 40 / 46 (86.95%) |
| Lines | 97 / 105 (92.38%) | 97 / 105 (92.38%) |
| Coverage-threshold exit code | 1 | 1 |

Aggregate and per-file Istanbul summaries match exactly across all 19 files.
The official coverage run reported 2.678 seconds (5.84 seconds wall and a
582,041,600-byte peak RSS); Rjest reported 9.118 seconds (11.48 seconds wall and
a 547,504,128-byte peak RSS). Those single coverage measurements are 3.40 times
slower by reported time and 1.97 times slower by wall time, while Rjest used
0.94 times the peak RSS. These are compatibility measurements, not benchmark
wins.

## Commands

The checkout and machine-readable results live under ignored `base/corpus`:

```sh
cd base/corpus/amplify-js
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/react-native test
CI=true npm exec --yes --package=node@24 --package=yarn@1.22.22 -- \
  yarn workspace @aws-amplify/react-native run jest \
  -w 1 --logHeapUsage --json \
  --outputFile=../../../results/amplify-react-native/official-no-coverage-node24.json
cd packages/react-native
CI=true npm exec --yes --package=node@24 -- \
  ../../../../../target/debug/rjest \
  -w 1 --logHeapUsage --json \
  --outputFile=../../../results/amplify-react-native/rjest-no-coverage-node24.json
cd ../../../../..
npm run compare:corpus -- \
  --root base/corpus/amplify-js/packages/react-native \
  base/corpus/results/amplify-react-native/official-no-coverage-node24.json \
  base/corpus/results/amplify-react-native/rjest-no-coverage-node24.json
```

Add `--coverage` to both runner commands and use `official-node24.json` plus
`rjest-first-node24.json` to reproduce the exact coverage diagnostic and its
expected exit code one.

## Compatibility result

The first Rjest run matched the package's complete behavioral and coverage
surface, so no runtime change was needed. The versioned differential denominator
remains 56/56 scenarios; this real-project result is independent evidence and
does not inflate that score. It proves parity for this pinned React Native
package only.
