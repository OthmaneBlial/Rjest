# setup-matlab compatibility corpus

MathWorks' setup-matlab GitHub Action is the native-ESM and TypeScript corpus
used to drive Rjest beyond its initial synthetic ESM probe.

## Reproduction target

- Repository: <https://github.com/matlab-actions/setup-matlab>
- Commit: `07d3238d93fd50ac028d950eaed7aea844a70628`
- Lockfile SHA-256: `29181fe1972dd56b58d3d06538d29fba9ad11d2f9cd910c18eb0fd9c63176481`
- Install command: `npm ci`
- Runtime: Node 24.20.0
- Locked Jest package: 30.3.0
- Locked ts-jest: 29.4.6
- Locked TypeScript: 5.9.3

The checkout, source, configuration, and package lock remain unmodified. The
upstream test script enables Node VM modules and coverage. Its TypeScript config
uses `extensionsToTreatAsEsm`, `ts-jest` with `useESM`, a relative-specifier
`moduleNameMapper`, and a node_modules transform exception.

## Exact result and coverage parity

| Measurement | Official Jest | Rjest |
| --- | ---: | ---: |
| Discovered suites | 7 | 7 |
| Passing suites | 7 | 7 |
| Registered tests | 94 | 94 |
| Passing tests | 94 | 94 |
| Skipped / todo tests | 0 | 0 |
| Snapshots | 0 | 0 |
| Covered source files | 9 | 9 |
| Statements | 256 / 272 (94.11%) | 256 / 272 (94.11%) |
| Branches | 145 / 155 (93.54%) | 145 / 155 (93.54%) |
| Functions | 28 / 30 (93.33%) | 28 / 30 (93.33%) |
| Lines | 255 / 271 (94.09%) | 255 / 271 (94.09%) |
| Exit code | 0 | 0 |

A machine comparison using `istanbul-lib-coverage` found identical aggregate
and per-file summaries for every source. Source-map remapping also preserves
the same uncovered TypeScript lines.

The serial official run reported 2.975 seconds (4.94 seconds wall and
657,670,144-byte peak RSS). The final serial Rjest run reported 80.246 seconds
(81.25 seconds wall and 684,195,840-byte peak RSS). These timings expose a real
performance backlog in per-file `ts-jest` startup; they are not presented as a
speed win.

## Commands

The checkout and machine-readable results live under ignored `base/corpus`:

```sh
git clone https://github.com/matlab-actions/setup-matlab.git \
  base/corpus/setup-matlab
git -C base/corpus/setup-matlab checkout \
  07d3238d93fd50ac028d950eaed7aea844a70628
cd base/corpus/setup-matlab
npm ci
npm test -- --runInBand --json \
  --outputFile=../results/setup-matlab/official-node24.json
npm exec --yes --package=node@24 -- ../../../target/debug/rjest \
  --runInBand --json \
  --outputFile=../results/setup-matlab/rjest-native-esm-coverage-final.json
```

## Compatibility work exposed by this corpus

The first Rjest run stopped at configuration because `clearMocks` and
`extensionsToTreatAsEsm` were unsupported. The next iteration discovered all
seven suites but registered zero tests because ESM-preserving transformer output
was sent through CommonJS `require()`. Subsequent preserved fixes added:

- `clearMocks` runtime semantics and ESM-extension validation;
- native transformed ESM execution through Node module hooks;
- `@jest/globals`, top-level await, ESM mapping, and synchronous
  `unstable_mockModule` factories for relative, package, and built-in modules;
- transformer-tooling isolation, reducing one diagnostic suite from about 40.7
  seconds to about 3.5 seconds;
- protocol framing after raw stdout without a line break;
- Jest's promise-aware `toThrow` behavior;
- post-transform Istanbul instrumentation and original-source remapping.

The versioned differential corpus grew from 37 to 42 scenarios to preserve
these general behaviors. This result proves compatibility for the pinned suite.
Later differential work covers direct and graph-reachable async ESM mock
factories, ESM unmock/reset semantics, and asynchronous CommonJS/ESM registry
isolation. The broader Jest ESM surface remains future work.
