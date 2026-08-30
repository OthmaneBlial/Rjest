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

## First Rjest compatibility loop

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

After that fix, Apollo advances to the next explicit error:

```text
unsupported configuration fields: projects; Rjest does not silently ignore Jest options
```

Rjest therefore still executes zero Apollo tests. The current corpus result is
not a compatibility success and no Jest/Rjest performance ratio is reported.
The next implementation slice is the six-project configuration and aggregation
path, followed by an exact rerun of the unchanged command.

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

This report records an authoritative baseline plus one repaired blocker. It
does not claim Apollo Client can switch to Rjest yet.
