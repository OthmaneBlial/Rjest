# ts-jest compatibility corpus

The ts-jest repository is the compiler-heavy TypeScript corpus used to test
Rjest against a Jest transformer project's own unit suite.

## Reproduction target

- Repository: <https://github.com/kulshekhar/ts-jest>
- Commit: `b1a97ac485711377e01e72bac8b115e41a1c17ba`
- Lockfile SHA-256: `d95a03966e8fc9af80fa23eb24df5d1ad42be149cc6784ddfeda8ea09b2f5bd3`
- Install command: `npm ci --ignore-scripts --prefer-offline`
- Build commands: `npm run build` and `npm run postbuild`
- Runtime: Node 22.23.2
- Project version: ts-jest 29.4.12
- Locked Jest: 30.4.2
- Locked TypeScript: 5.9.3

The checkout, tests, Jest configuration, and lockfile remain unmodified. The
suite uses an executable `jest.config.ts`, its locally built transformer,
manual and virtual mocks, inline and external snapshots, parameterized tests,
and TypeScript compiler instances with substantial memory pressure.

## Exact result

| Measurement | Official Jest | Rjest |
| --- | ---: | ---: |
| Discovered suites | 20 | 20 |
| Passing suites | 20 | 20 |
| Registered tests | 358 | 358 |
| Passing tests | 358 | 358 |
| Skipped / todo tests | 0 | 0 |
| Matching snapshots | 137 | 137 |
| Failed / obsolete snapshots | 0 | 0 |
| Exit code | 0 | 0 |

The serial official run reported 135.901 seconds (142.94 seconds wall and
3,605,807,104-byte peak RSS). The final serial Rjest run reported 108.148
seconds (113.40 seconds wall and 2,825,912,320-byte peak RSS). These are single
recorded corpus runs, not a controlled repeated benchmark.

## Commands

The checkout and machine-readable results live under ignored `base/corpus`:

```sh
git clone https://github.com/kulshekhar/ts-jest.git base/corpus/ts-jest
git -C base/corpus/ts-jest checkout \
  b1a97ac485711377e01e72bac8b115e41a1c17ba
cd base/corpus/ts-jest
npm ci --ignore-scripts --prefer-offline
npm run build
npm run postbuild
CI=true DISABLE_MOCKED_WARNING=true \
  npm exec --yes --package=node@22 -- npm test -- \
  --runInBand --json \
  --outputFile=../results/ts-jest/official-node22.json
CI=true DISABLE_MOCKED_WARNING=true \
  npm exec --yes --package=node@22 -- ../../../target/debug/rjest \
  --config=jest.config.ts --runInBand --json \
  --outputFile=../results/ts-jest/rjest-final-node22.json
```

## Compatibility work exposed by this corpus

The first configuration-complete Rjest run discovered all 20 suites but only
registered 112 of 358 tests; 40 passed. The dominant suite-load failure was an
unresolved manual logger mock. Preserved fixes then added:

- TypeScript config imports and `<rootDir>` expansion in discovery patterns;
- adjacent and ancestor/bare-module manual mock lookup;
- exact assertion-count APIs and virtual CommonJS mock factories;
- Jest-compatible inline indentation, current and legacy string escaping, and
  parameterized object/pretty-name interpolation for snapshot keys;
- transformer dependency isolation from the test module cache;
- weak mock tracking and event-loop yielding, reducing the compiler stress
  suite from a 4 GB heap crash to 116/116 passing at about 2.84 GB peak RSS.

The versioned differential corpus grew from 42 to 49 scenarios to preserve the
general behaviors. This result proves compatibility for the pinned unit suite;
the repository's separate e2e and example matrices remain additional work.
