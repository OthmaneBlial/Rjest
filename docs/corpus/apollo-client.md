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
the second capture below measures their effect before the latest environment
and equality repairs.

## Second full Rjest capture

The next complete run used commit `1ce28ab`. It includes the fake-timer boundary
repair, but predates the later custom-JSDOM event, host-global, equality, and
asymmetric-matcher fixes:

| Measurement | Second Rjest capture |
| --- | ---: |
| Discovered project-suite executions | 563 |
| Passed / failed / skipped suites | 527 / 18 / 18 |
| Registered tests | 9,974 |
| Passed / failed / skipped tests | 9,465 / 33 / 476 |
| Matched / unmatched snapshots | 519 / 0 |
| File-level errors | 0 |
| Exit code | 1 |
| Rjest-reported time | 3,041.443 s |
| End-to-end wall time | 3,043.54 s |
| Peak RSS | 2,088,697,856 bytes |
| Test-identity parity | 9,974 / 9,974 (100.000%) |
| Test identity/status parity | 9,938 / 9,974 (99.639%) |

The suite outcome split is derived from the registered test statuses; Rjest's
compact reporter counts the 18 all-skipped suite executions among its 545
non-failing suites. The automated comparator treats test records as multisets
of normalized project path, full test name, and status. This prevents duplicate
project executions or reordered results from inflating the score. It also emits
derived suite/test status counts and the exact official-only and Rjest-only
records with multiplicities, so every lost match becomes a reproducible backlog
item.

Three of the 33 Rjest failures reproduce official Jest's WHATWG stream
failures. Of the remaining 30 Rjest-only failures, 28 now have later exact
targeted evidence: 12 custom-JSDOM event failures, six host-`fetch` failures,
four React 19 scheduler-path failures, three nested `objectContaining`
failures, and three flattened-asymmetric-matcher failures. The two captured
Rjest-only failures still requiring investigation are the timing-sensitive
`useQuery` stale-variables case and a `useLazyQuery` manual-trigger case. Six
official-Jest-only GC/minimum-RxJS failures also contribute to the 36 status
differences. The latest-source capture below recalculates this corpus score
after all five repairs.

## Latest full Rjest capture

The latest complete run used the exact `7e7c5e5` binary, which contains all five
subsequent targeted repairs. The later `8884829` commit only extends the
result-file comparator and does not change the runtime under test:

```sh
cd base/corpus/apollo-client
env NODE_OPTIONS='--expose-gc --experimental-import-meta-resolve --disable-warning=ExperimentalWarning' \
  /usr/bin/time -l -o ../results/jest-apollo-client/rjest-latest.time.log \
  ../../../target/debug/rjest \
  --config ./config/jest.config.ts --runInBand --json \
  --outputFile=../results/jest-apollo-client/rjest-latest.json
cd ../../..
npm run compare:corpus -- \
  --root base/corpus/apollo-client \
  base/corpus/results/jest-apollo-client/official.json \
  base/corpus/results/jest-apollo-client/rjest-latest.json
```

| Measurement | Latest Rjest capture |
| --- | ---: |
| Discovered project-suite executions | 563 |
| Passed / failed / skipped suites | 542 / 3 / 18 |
| Registered tests | 9,974 |
| Passed / failed / skipped tests | 9,495 / 3 / 476 |
| Matched / unmatched snapshots | 519 / 0 |
| File-level errors | 0 |
| Exit code | 1 |
| Rjest-reported time | 2,649.389 s |
| End-to-end wall time | 2,651.08 s |
| Peak RSS | 2,118,156,288 bytes |
| Test-identity parity | 9,974 / 9,974 (100.000%) |
| Test identity/status parity | 9,968 / 9,974 (99.940%) |

Every test that passed under the recorded official baseline also passes under
Rjest, every skipped identity remains skipped, and all 519 snapshots match.
Rjest has no file errors and no Rjest-only failing test. Its three failures are
the same WHATWG response-stream identity repeated across the three Core
projects, which also fails in the official baseline.

The six strict status differences run in the other direction: Rjest passes one
minimum-RxJS `ApolloClient` assertion and five forced-GC assertions that failed
in the recorded official run. Three consecutive official-Jest isolated
rechecks passed all nine selected assertions across their six project-suite
executions; the paired Rjest recheck is exact across all 453 registered
statuses (9 passed and 444 skipped). The frozen full-run comparison remains
99.940% rather than hiding this run-order/GC instability, while the recheck
shows no stable isolated incompatibility for those six identities.

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
| `ApolloClient/general.test.ts` | Core / min-RxJS / GraphQL 16 | 423 passed, 24 skipped | 423 passed, 24 skipped |
| `local-state/export.ts` + `local-state/general.ts` | Core / min-RxJS / GraphQL 16 | 177 passed, 15 snapshots | 177 passed, 15 snapshots |
| `useLoadableQuery.test.tsx` | React 18 / 19 | 98 / 98 passed | 98 / 98 passed |
| `useSuspenseFragment.test.tsx` | React 18 / 19 | 52 passed, 28 skipped | 52 passed, 28 skipped |
| `useSuspenseQuery.test.tsx` | React 18 / 19 | 318 / 318 passed | 318 / 318 passed |
| `streamGraphQL17Alpha9.test.tsx` | React 18 / 19 | 36 / 36 passed | 36 / 36 passed |
| `useFragment.test.tsx` | React 17 / 18 / 19 | 99 passed, 6 skipped | 99 passed, 6 skipped |
| `useQuery.test.tsx` | React 17 / 18 / 19 | 477 / 477 passed | 477 / 477 passed |
| `onlineSource.test.ts` + `windowFocusSource.test.ts` | Core / min-RxJS / GraphQL 16 | 12 / 12 passed | 12 / 12 passed |
| `HttpLink.ts` (`HttpLink Dev warnings`) | Core / min-RxJS / GraphQL 16 | 9 passed, 246 skipped | 9 passed, 246 skipped |
| `MockedProvider.test.tsx` (`maxUsageCount`) | React 17 / 18 / 19 | 3 passed, 84 skipped | 3 passed, 84 skipped |
| `mockLink.ts` | Core / min-RxJS / GraphQL 16 | 138 passed, 12 skipped, 42 snapshots | 138 passed, 12 skipped, 42 snapshots |
| `policies.ts` | Core / min-RxJS / GraphQL 16 | 153 passed, 78 snapshots | 153 passed, 78 snapshots |

The latest complete capture strengthens these targeted results: all previously
Rjest-only failures, including the `useLazyQuery` manual-trigger and `useQuery`
stale-variable cases, now pass in every applicable React project. Strict status
parity remains 99.940% only because Rjest passes six failures from the frozen
official baseline. Rjest is still materially slower than Jest, and correctness
remains the priority over performance claims.

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

This report records an authoritative baseline, three full Rjest convergence
captures, automated real-corpus status scores, and exact targeted rechecks.
For this pinned run, replacing Jest with Rjest introduces no additional failing
or skipped test and preserves every snapshot. This is evidence for this corpus,
not a claim of complete Jest compatibility across unmeasured projects.
