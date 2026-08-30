# styled-components web compatibility corpus

styled-components is a production React CSS-in-JS library with a large,
snapshot-heavy Jest suite. Its original web configuration exercises a pnpm 10
workspace with the hoisted linker, React 19, Jest 30.3, JSDOM, Babel-transformed
TypeScript and TSX, setup modules, legacy fake timers, a custom HTML snapshot
serializer, SSR, streaming, mocks, and a WPT-derived parser corpus.

## Reproducible revision

- Repository: `https://github.com/styled-components/styled-components.git`
- Revision: `5f2a27ad31d4b17315a099c7f4ac8300c15f2cc2`
- Node: `25.9.0`
- Package manager: pnpm `10.0.0`
- Jest: `30.3.0` from the frozen dependency graph
- Lockfile SHA-256:
  `683840e20892c1be12f35ef006e87b0748c809162b987f21b46fec43898cce3f`
- Linker: `node-linker=hoisted`

The checkout and generated results stay ignored under `base/corpus`. Install
the exact dependency graph without changing the lockfile:

```bash
cd base/corpus/styled-components
pnpm install --frozen-lockfile
```

## Commands

The official baseline executes the package's original `test:web` Jest config:

```bash
/usr/bin/time -l pnpm --filter styled-components exec jest \
  -c jest.config.main.js --runInBand --no-cache --json \
  --outputFile=/absolute/path/to/official.json
```

Rjest runs the same config and selected test files from the package directory:

```bash
cd packages/styled-components
/usr/bin/time -l /absolute/path/to/rjest \
  --config jest.config.main.js --runInBand --json \
  --outputFile=/absolute/path/to/rjest.json
```

Compare the complete captures:

```bash
npm run compare:corpus -- \
  --root base/corpus/styled-components/packages/styled-components \
  base/corpus/results/styled-components-web/official.json \
  base/corpus/results/styled-components-web/rjest-final.json
```

## Result

| Signal | Official Jest | Rjest |
| --- | ---: | ---: |
| Suites | 59 passed / 59 | 59 passed / 59 |
| Tests | 1,465 passed / 1,465 | 1,465 passed / 1,465 |
| Snapshots | 749 matched / 749 | 749 matched / 749 |
| Exit code | 0 | 0 |
| Runner-reported time | 11.472 s | 75.535 s |
| End-to-end wall time | 13.50 s | 76.12 s |
| Peak RSS | 1,234,059,264 bytes | 748,765,184 bytes |

The automated comparator reports exact suite paths, all 1,465 test identities
and statuses, and all 749 snapshot counts. Identity parity and strict
identity/status parity are both 1,465/1,465 (100%). In these single serial
captures Rjest is about 5.64 times slower by wall time and uses about 39.3%
less peak RSS. These are observed corpus measurements, not general benchmark
claims.

## Compatibility work exposed by styled-components

The initial Rjest discovery selected 105 files instead of Jest's 59 because
`<rootDir>` remained literal in `testPathIgnorePatterns` and `rootDir: '.'`
retained a lexical `/.`. The extra 46 files included native and stress benchmark
suites; `src/bench/web.test.js` exhausted a 4 GB V8 heap and aborted the run.
Rjest now normalizes the root and substitutes it in every supported ignore-regex
family. A differential fixture retains the exact discovery failure.

After discovery parity, Rjest passed 1,464/1,465 tests and 748/749 snapshots.
The remaining inline snapshot contains a mocked React transitional element.
The project's Jest 30.3 formatter serializes it as a plain object, while Rjest's
bundled Pretty Format 30.5 recognizes it as JSX. Rjest now resolves Pretty
Format through the installed Jest package's `@jest/core` dependency, with its
bundled formatter as a fallback. A separate Jest 30.3 differential fixture
preserves that version boundary.

This result proves the original web Jest configuration at the pinned revision.
It does not claim parity for the separate React Native config, build-output
tests, TypeScript-only checks, or benchmark configs.
