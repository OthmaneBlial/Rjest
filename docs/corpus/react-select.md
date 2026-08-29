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
../../../target/debug/rjest --maxWorkers=4 --json \
  --outputFile=../results/react-select/rjest-result.json
```

The upstream `test:jest` script includes `--coverage`. Official Jest retained
that flag in the baseline; Rjest does not implement coverage output yet. The
table therefore proves test discovery, status, and snapshot parity for the exact
suite, not coverage-report parity or zero-change script compatibility. The timed
commands also used different worker settings and are not a fair benchmark.

## Compatibility work exposed by this corpus

The first Rjest discovery found eight files because a custom `testRegex` was
incorrectly combined with default `testMatch`. The first execution registered
zero tests because it rejected Emotion's modern serializer shape. The final
passing run required general support for:

- Jest's mutual exclusion between `testRegex` and `testMatch`;
- the historical JSDOM default when a project uses Jest earlier than 27;
- the implicit `babel-jest` transform and a repository Babel config;
- Babel-Jest's older four-argument transformer contract;
- legacy Pretty Format exports and option sets;
- serializer plugins exposing `serialize()` instead of `print()`;
- constructing the test environment before loading serializers.

The versioned differential corpus now preserves the applicable config,
transform, and serializer behaviors. This page remains a corpus-specific result,
not a complete Jest API score.
