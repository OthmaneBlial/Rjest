# React Testing Library compatibility corpus

React Testing Library is a production React 19 and JSDOM corpus whose original
Jest suite exercises real rendering, cleanup, hooks, events, error boundaries,
debug output, Jest DOM matchers, Babel transforms, and external snapshots.

## Reproduction target

- Repository: <https://github.com/testing-library/react-testing-library>
- Commit: `20ce75f2907ca0e5c5a8ae595c0e9a4e368c7800`
- Node: `25.9.0`
- Yarn: `1.22.22`
- Resolved Jest/JSDOM/Babel-Jest: `29.7.0`
- Resolved React/React DOM: `19.2.8`
- Resolved Testing Library DOM: `10.4.1`
- Resolved Jest DOM: `5.17.0`
- Resolved TypeScript: `5.9.3`
- `package.json` SHA-256:
  `fed8bb74405cde8a42c800019c41793a3fb9e6bcdfb29489a3eacd141da25f00`

The repository does not commit a dependency lockfile at this revision. These
resolved versions and the two manifest/config hashes therefore describe the
executed capture; they are not a promise that a future unconstrained install
will resolve the same graph.

## Commands

The ignored checkout was installed without creating a lockfile:

```sh
cd base/corpus/react-testing-library
CYPRESS_INSTALL_BINARY=0 yarn install --no-lockfile --non-interactive
```

The original `yarn test` command completed all tests but official Jest retained
an upstream open handle under Node 25 and remained alive after its warning. The
comparable machine-readable captures add `--forceExit` to both runners after
the same unchanged suite:

```sh
CI=true yarn test --runInBand --watch=false --no-cache --forceExit \
  --json --outputFile=../results/react-testing-library/official-force-exit.json

CI=true /absolute/path/to/rjest \
  --config=jest.config.js --runInBand --no-cache --forceExit \
  --json --outputFile=../results/react-testing-library/rjest-final.json
```

The comparator command is:

```sh
npm run compare:corpus -- \
  --root base/corpus/react-testing-library \
  base/corpus/results/react-testing-library/official-force-exit.json \
  base/corpus/results/react-testing-library/rjest-final.json
```

## Exact result

| Signal | Official Jest | Rjest |
| --- | ---: | ---: |
| Suites | 16 passed / 16 | 16 passed / 16 |
| Tests | 248 passed · 3 skipped / 251 | 248 passed · 3 skipped / 251 |
| Snapshots | 11 matched / 11 | 11 matched / 11 |
| File errors | 0 | 0 |
| Exit code with `--forceExit` | 0 | 0 |
| Runner-reported time | 5.319 s | 16.994 s |
| End-to-end wall time | 6.72 s | 17.37 s |
| Peak RSS | 449,822,720 bytes | 229,490,688 bytes |

The reusable comparator reports exact suite paths, 251/251 test identities,
251/251 identity/status pairs, exact per-file skips, and exact snapshot totals.
The checkout is clean after the final Rjest run.

These are single warm captures after each runner had already executed the
suite. Rjest was about 2.59 times slower by wall time and used about 49% less
peak RSS in this pair. They are corpus observations, not a general benchmark.

## Compatibility work exposed by the corpus

Rjest's first run passed every test and reported all 11 snapshots as matched,
but it still rewrote `render.js.snap`. The file used Jest 29's historical v1
header:

```text
// Jest Snapshot v1, https://goo.gl/fbAQLP
```

Official Jest 29 preserved that header. Rjest treated every header except the
new Jest 30 documentation URL as dirty, so its default new-snapshot mode
silently migrated a tracked file despite reporting zero updates.

Rjest now accepts both recognized Jest v1 headers, preserves the existing
header when snapshot contents are written, and continues to reject unknown
headers outside explicit update mode. The permanent differential uses a pinned
Jest 29.7 oracle because Jest 30 has different migration behavior. A Rust unit
test also covers legacy load and persistence.

This corpus proves the unchanged React Testing Library suite under the pinned
source and resolved dependency graph. It does not prove the project's build,
lint, typecheck, React 18 matrix, coverage thresholds, or future unlocked
dependency resolutions.
