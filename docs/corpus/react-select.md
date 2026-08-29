# React Select compatibility corpus

React Select is the second unchanged React/Jest corpus used to drive Rjest
compatibility across an older Jest generation.

## Reproduction target

- Repository: <https://github.com/JedWatson/react-select>
- Commit: `4b6948078684bee394e09dd8e7cdc2d7f89e0fad`
- Install command: `CYPRESS_INSTALL_BINARY=0 yarn install --frozen-lockfile`
- Lockfile: upstream Yarn v1 lockfile
- Resolved Jest: 25.5.4
- Resolved Babel-Jest: 23.6.0
- Resolved React / React DOM: 16.14.0
- Resolved Testing Library React: 12.1.4
- Resolved TypeScript: 4.3.2

Disabling the unrelated Cypress binary download does not change the Jest suite.
The upstream checkout, tests, configuration, and lockfile remain unmodified.

## Exact test-result parity

| Measurement | Official Jest | Rjest |
| --- | ---: | ---: |
| Discovered suites | 5 | 5 |
| Passing suites | 5 | 5 |
| Registered tests | 258 | 258 |
| Passing tests | 255 | 255 |
| Skipped tests | 3 | 3 |
| Matching snapshots | 5 | 5 |
| Covered source files | 39 | 39 |
| Statements | 1,064 / 1,438 (73.99%) | 1,064 / 1,438 (73.99%) |
| Branches | 659 / 1,054 (62.52%) | 659 / 1,054 (62.52%) |
| Functions | 251 / 312 (80.44%) | 251 / 312 (80.44%) |
| Lines | 1,033 / 1,363 (75.78%) | 1,033 / 1,363 (75.78%) |
| Exit code | 0 | 0 |

The sorted discovery path diff was empty. The five snapshots pass through React
Select's configured Emotion serializer.

## Commands

The checkout and machine-readable results live under ignored `base/corpus`:

```sh
git clone https://github.com/JedWatson/react-select.git base/corpus/react-select
git -C base/corpus/react-select checkout 4b6948078684bee394e09dd8e7cdc2d7f89e0fad
cd base/corpus/react-select
CYPRESS_INSTALL_BINARY=0 yarn install --frozen-lockfile
yarn test:jest --runInBand --json \
  --outputFile=../results/react-select/jest-baseline.json
../../../target/debug/rjest --coverage --maxWorkers=4 --json \
  --outputFile=../results/react-select/rjest-result.json
```

The upstream `test:jest` script is `jest --coverage`; `rjest --coverage` now
passes without changing the checkout. A separate same-runner-mode comparison
used `--runInBand --coverageReporters=json-summary` and found an empty semantic
diff across all 39 per-file summaries and the aggregate totals shown above.
Official Jest reported 8.264 seconds (11.19 seconds wall, 705,970,176-byte peak
RSS); Rjest reported 17.494 seconds (17.58 seconds wall, 507,953,152-byte peak
RSS). This is correctness evidence, not a speed win. A four-worker Rjest run
preserved the exact coverage summary in 9.149 reported seconds (9.93 seconds
wall, 515,178,496-byte peak RSS), but it is not compared as a fair benchmark
against the serial Jest run.

## Compatibility work exposed by this corpus

The first Rjest discovery found eight files because a custom `testRegex` was
incorrectly combined with default `testMatch`. The first execution registered
zero tests because it rejected Emotion's modern serializer shape. The final
passing run required general support for:

- Jest's mutual exclusion between `testRegex` and `testMatch`;
- the historical JSDOM default when a project uses Jest earlier than 27;
- the implicit `babel-jest` transform and a repository Babel config;
- resolving Jest's bundled Babel-Jest version instead of a mismatched direct
  dependency;
- Babel-Jest's older four-argument transformer contract;
- legacy Pretty Format exports and option sets;
- serializer plugins exposing `serialize()` instead of `print()`;
- constructing the test environment before loading serializers.
- excluding tests/setup/tooling from instrumentation, merging counters from
  file workers, and matching the legacy Istanbul summary convention.

The versioned differential corpus now preserves the applicable config,
transform, and serializer behaviors. This page remains a corpus-specific result,
not a complete Jest API score.
