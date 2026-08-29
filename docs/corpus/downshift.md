# Downshift compatibility corpus

Downshift is the first substantial unchanged React/Jest corpus used to drive
Rjest compatibility work.

## Reproduction target

- Repository: <https://github.com/downshift-js/downshift>
- Commit: `1bb8b75e506fe807a5c5201a103d1bd128e5a5e2`
- Install command: `npm install --ignore-scripts --no-audit --no-fund`
- Resolved Jest, JSDOM, and Babel-Jest: 29.7.0
- Resolved React: 18.3.1
- Resolved Testing Library React: 16.3.3
- Resolved TypeScript: 5.9.3
- Resolved kcd-scripts: 17.0.0

The upstream commit has no dependency lockfile. These results therefore apply
to the recorded installed dependency tree; reinstalling requires a fresh
official Jest baseline before comparison.

## Exact results

| Measurement | Official Jest | Rjest |
| --- | ---: | ---: |
| Discovered suites | 92 | 92 |
| Passing suites | 92 | 92 |
| Registered tests | 1,110 | 1,110 |
| Passing tests | 1,110 | 1,110 |
| Matching snapshots | 49 | 49 |
| Exit code | 0 | 0 |

The sorted discovery path diff was empty. Rjest's 49 snapshot assertions include
27 external and 22 inline snapshots.

## Commands

The checkout and machine-readable results live under ignored `base/corpus`:

```sh
git clone https://github.com/downshift-js/downshift base/corpus/downshift
git -C base/corpus/downshift checkout 1bb8b75e506fe807a5c5201a103d1bd128e5a5e2
cd base/corpus/downshift
npm install --ignore-scripts --no-audit --no-fund
CI=1 npm test -- --runInBand --watch=false --json \
  --outputFile=../results/downshift/jest-baseline.json
../../../target/debug/rjest --maxWorkers=4 --json \
  --outputFile=../results/downshift/rjest-result.json
```

The timed runs used different worker settings, so their elapsed time and memory
figures are diagnostic execution data, not a fair performance benchmark.

## Compatibility work exposed by this corpus

The first executable Rjest iteration registered only seven tests. Successive
differential passes added executable Jest config fields, Jest extglob discovery,
configured Babel transforms, JSDOM and setup files, DOM snapshot serializers,
module-scoped mock resolution, missing matchers, modern fake timers, protected
JSDOM bindings, Jest's `NODE_ENV=test` default, inline snapshot accounting, and
worker wall-clock termination. An intermediate full run reached 1,047/1,110
passing before the final 1,110/1,110 result.

This page reports compatibility only for this pinned corpus. Global API scores
come separately from the versioned differential scenarios in
`compat/jest-compatibility.json`.
