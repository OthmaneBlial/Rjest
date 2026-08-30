# Granite compatibility corpus

Granite is Toss's production React Native framework and tooling monorepo. The
pinned `@granite-js/style-utils` workspace is a focused Jest corpus inside a
larger repository whose other packages primarily use Vitest. It exercises Yarn
4 Plug'n'Play with zip-backed dependencies and no fallback, React 19, React
Native Testing Library, TSX through Babel, the React Native custom resolver and
environment, Haste platform extensions, setup modules, custom matchers, and
inline snapshots.

## Reproducible revision

- Repository: `https://github.com/toss/granite.git`
- Revision: `634cd9d82272bcc93b86e2ce70b925fc22abc148`
- Node: `24.13.0`, matching the checkout's `.nvmrc`
- Package manager: Yarn `4.12.0`, from the committed release
- Jest: `29.7.0`
- Lockfile SHA-256:
  `ea03dddb773a0205900f9c988c94489cf57a6dcbeb9654dd5ff1c2763fc8966b`
- PnP settings: `nodeLinker: pnp`, `pnpFallbackMode: none`, and
  `enableGlobalCache: false`

The checkout and generated evidence remain ignored under `base/corpus`.
Install the pinned dependency graph without modifying it:

```bash
cd base/corpus/granite
npx --yes node@24.13.0 .yarn/releases/yarn-4.12.0.cjs install --immutable
```

## Commands

The official baseline runs the workspace's original `test` script and config:

```bash
/usr/bin/time -l \
  npx --yes node@24.13.0 .yarn/releases/yarn-4.12.0.cjs \
  workspace @granite-js/style-utils test \
  --runInBand --no-cache --json \
  --outputFile=/absolute/path/to/official.json
```

The Rjest run selects the same workspace, normalized config, and tests:

```bash
/usr/bin/time -l \
  npx --yes node@24.13.0 .yarn/releases/yarn-4.12.0.cjs \
  workspace @granite-js/style-utils exec /absolute/path/to/rjest \
  --runInBand --json \
  --outputFile=/absolute/path/to/rjest.json
```

Compare the complete machine-readable captures:

```bash
npm run compare:corpus -- \
  --root base/corpus/granite/packages/style-utils \
  base/corpus/results/granite/official.json \
  base/corpus/results/granite/rjest-full-final.json
```

## Result

| Signal | Official Jest | Rjest |
| --- | ---: | ---: |
| Suites | 5 passed / 5 | 5 passed / 5 |
| Tests | 29 passed / 29 | 29 passed / 29 |
| Inline snapshots | 3 matched / 3 | 3 matched / 3 |
| Exit code | 0 | 0 |
| Runner-reported time | 9.012 s | 20.799 s |
| End-to-end wall time | 12.27 s | 22.85 s |
| Peak RSS | 968,736,768 bytes | 573,489,152 bytes |

The corpus comparator reports exact suite paths, all 29 test identities and
statuses, and all three snapshot counts. Identity parity and strict
identity/status parity are both 29/29 (100%). In these single captures Rjest is
about 1.86 times slower by wall time and uses about 40.8% less peak RSS. These
are observed corpus measurements, not broad benchmark claims.

## Compatibility work exposed by Granite

The first Rjest attempt stopped before discovery because six valid Jest options
were rejected: `detectOpenHandles`, `forceExit`, `globals`, `haste`,
`maxConcurrency`, and `passWithNoTests`. Adding strict normalization and runtime
propagation expanded the differential suite with configuration, Haste-platform,
global-copy, concurrency, and empty-suite cases.

Strict PnP then exposed three runtime boundaries:

- Rjest's resolver and snapshot-formatting dependencies must be loaded from the
  runner installation, not demanded from the test project's dependency map.
- A configured Jest resolver that delegates to `defaultResolver` must retain
  PnP resolution, conditions, and platform-extension ordering.
- CommonJS receives a Jest object bound to the module that defines a function.
  A shared global object incorrectly resolved React Native's
  `jest.requireActual('../Libraries/...')` relative to its later caller.

After those fixes, the first complete Rjest run reached 28/29 tests. The final
failure proved that runner-owned Pretty Format must remain available under
strict PnP so ordinary object snapshots use Jest's sorted-key serialization.
Both boundaries are retained in the differential corpus.

Granite also exposed a severe transformer cost. Rjest previously discarded
every dependency Babel loaded lazily after each source transform. A single
three-test file first consumed roughly 2.32 GB and took about 58.5 seconds while
still failing, then exceeded the 120-second worker limit once execution advanced
further. Transformer dependencies now live in a persistent cache isolated from
the test module registry. The same file passes in 3.984 seconds of reported
runner time with about 561 MB peak RSS, while the full corpus completes with the
results above.

This proves the pinned focused Jest workspace under these exact conditions. It
does not claim that Granite's separate Vitest suites run under Rjest or that all
Yarn PnP and React Native configurations are covered.
