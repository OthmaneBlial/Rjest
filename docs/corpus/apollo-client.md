# Apollo Client compatibility corpus

Apollo Client is a production TypeScript/React workspace whose current unit
command runs Jest 30 across six projects. The matrix repeats Core tests under
the default, minimum-RxJS, and GraphQL-16 dependency mappings, then executes
React tests against React DOM 17, 18, and 19. It is the first Rjest corpus to
exercise Jest's multi-project configuration at this scale.

## Reproduction target

- Repository: <https://github.com/apollographql/apollo-client>
- Commit: `70e3a11d93c8ef8d64aa2a7d12b02b773a57c7ca`
- Commit date: 2026-08-27
- Project version: 4.2.12
- Lockfile SHA-256: `52711a7f26a8c389b807bf070522581b3fa957e2a3b65c4d2bc34f60a17fd1e3`
- Install command: `npm ci`
- Runtime: Node 25.9.0 and npm 11.12.1
- Locked Jest / Jest Config: 30.4.2
- Locked ts-jest: 29.4.12
- Locked JSDOM environment: 30.4.1
- Host: macOS 26.6, arm64, Apple M2

The checkout and lockfile remain unmodified. The install applied the project's
committed `patch-package` patches. npm reported vulnerabilities in the ignored
third-party dependency tree; the corpus was not rewritten or upgraded because
both runners must use the same locked installation.

## Official Jest baseline

The original `npm test` script was run unchanged except for `--runInBand`, JSON
output, and resource measurement:

```sh
cd base/corpus/apollo-client
npm ci
/usr/bin/time -l npm test -- \
  --runInBand --json \
  --outputFile=../results/jest-apollo-client/official.json
```

| Measurement | Official Jest |
| --- | ---: |
| Registered suites | 563 |
| Passed / failed / skipped suites | 538 / 7 / 18 |
| Registered tests | 9,974 |
| Passed / failed / skipped tests | 9,489 / 9 / 476 |
| Matched snapshots | 519 / 519 |
| Exit code | 1 |
| Jest-reported time | 1,076.87 s |
| End-to-end wall time | 1,079.95 s |
| Peak RSS | 2,988,326,912 bytes |

The nine failures are part of the official Node 25/macOS baseline, not Rjest
results. One minimum-RxJS `ApolloClient` stream did not emit, the same WHATWG
stream assertion failed under three Core dependency variants, and five forced
GC assertions across three `FinalizationRegistry` suites did not observe their
callbacks. The machine-readable baseline preserves every failing identity so a
later Rjest comparison must reproduce or improve on evidence, not assume the
upstream command is green.

## First full Rjest capture

The first complete six-project Rjest run used commit `593933e`, before the
subsequent `test.failing`, custom matcher-context, mock snapshot, and fake-timer
repairs. It is retained as an honest convergence baseline rather than presented
as the current implementation's result:

| Measurement | Initial Rjest capture |
| --- | ---: |
| Discovered project-suite executions | 563 |
| Passed / failed / skipped suites | 338 / 207 / 18 |
| Reported tests | 8,661 |
| Passed / failed / skipped tests | 6,030 / 2,225 / 406 |
| Matched / unmatched snapshots | 383 / 66 |
| File-level errors | 35 across 29 suites |
| Exit code | 1 |
| Rjest-reported time | 3,130.34 s |
| End-to-end wall time | 3,131.69 s |
| Peak RSS | 2,122,645,504 bytes |

The capture exposed concentrated causes rather than 2,225 unrelated failures:
1,900 tests failed on Apollo's `expect.toBeOneOf` asymmetric matcher, another
171 on a missing matcher color utility, and 36 promise assertions inherited the
same asymmetric-matcher error. Thirteen project-suite executions failed to load
because `it.failing` or `test.failing` was absent. Six more hit Rjest's safety
timeout, including all three `useQuery.test.tsx` projects. Those classes now
have official-Jest differential regressions and targeted corpus verification;
a fresh full capture is required to measure the remaining denominator.

## Rjest compatibility loop

The first Rjest attempt failed while evaluating `config/jest.config.ts`. Apollo
is a `"type": "module"` package and its `.ts` config uses
`import.meta.resolve` and `import.meta.dirname`; Rjest previously forced every
`.ts` config through a CommonJS ts-node hook.

Rjest now follows Jest 30's native-first boundary. On Node versions with native
TypeScript stripping, `.ts`, `.cts`, and `.mts` configs are imported with their
package-defined module semantics. `.ts` and `.cts` fall back to the CommonJS
ts-node path only after a native `SyntaxError`; `.mts` is never reinterpreted as
CommonJS. A permanent official-Jest differential fixture executes type syntax
and both `import.meta` APIs from an ESM `.ts` config.

After that fix, Apollo exposed the unsupported six-entry `projects` field. Rjest
now normalizes each inline project independently and executes it with its own
root, test patterns, display name, mappings, transformer, environment, setup,
snapshots, and resolver. This work also added the generic `ts-jest` preset path,
configured snapshot formatting, custom equality testers, shared installed
`expect` matcher state, Jest's conditional resolver boundary, mapped CommonJS
`.js` behavior in type-module packages, and safe host APIs for the custom JSDOM
environment. Each repair has a permanent official-Jest differential fixture.

Discovery is now exact: official Jest and Rjest each report the same 196 unique
paths with `--listTests`. Two unchanged cross-project probes also match:

| Probe | Projects | Official Jest | Rjest |
| --- | ---: | ---: | ---: |
| `maskFragment.test.ts` | Core / min-RxJS / GraphQL 16 | 78 / 78 passed | 78 / 78 passed |
| `useMutation.test.tsx` | React 17 / 18 / 19 | 123 / 123 passed | 123 / 123 passed |
| `responseIterator.ts` | Core / min-RxJS / GraphQL 16 | 30 / 30 passed | 30 / 30 passed |
| `ObservableQuery.ts` | Core / min-RxJS / GraphQL 16 | 411 passed, 24 skipped | 411 passed, 24 skipped |
| `ApolloClient.ts` | Core / min-RxJS / GraphQL 16 | 225 passed, 18 skipped, 60 snapshots | 225 passed, 18 skipped, 60 snapshots |
| `useLoadableQuery.test.tsx` | React 18 / 19 | 98 / 98 passed | 98 / 98 passed |
| `useSuspenseFragment.test.tsx` | React 18 / 19 | 52 passed, 28 skipped | 52 passed, 28 skipped |
| `streamGraphQL17Alpha9.test.tsx` | React 18 / 19 | 36 / 36 passed | 36 / 36 passed |
| `useFragment.test.tsx` | React 17 / 18 / 19 | 99 passed, 6 skipped | 99 passed, 6 skipped |
| `useQuery.test.tsx` | React 17 / 18 / 19 | 477 / 477 passed | 476 / 477 passed |
| `onlineSource.test.ts` + `windowFocusSource.test.ts` | Core / min-RxJS / GraphQL 16 | 12 / 12 passed | 12 / 12 passed |

These are targeted compatibility results, not a claim for the complete corpus.
The remaining `useQuery` mismatch is timing-sensitive and has moved between
React 18 and 19 on isolated reruns; it is not counted as compatible. A fresh
full 563-suite capture with all repairs and strict comparison remains in
progress. The initial run is also much slower than Jest, but correctness is
still the priority and no performance claim is inferred from mismatched runs.

## Compatibility pressure

The pinned suite combines:

- six inline Jest project configs and display names;
- TypeScript/TSX through ts-jest;
- a custom JSDOM environment and custom resolver;
- React DOM 17, 18, and 19 package mappings;
- conditional workspace exports and transformed RxJS dependencies;
- 519 snapshot assertions;
- nearly ten thousand registered tests under repeated dependency variants;
- forced garbage collection and a roughly 3 GB official-Jest peak RSS.

This report records an authoritative baseline, exact discovery, the first full
Rjest convergence capture, and repaired multi-project execution slices. It does
not yet claim Apollo Client can switch to Rjest.
