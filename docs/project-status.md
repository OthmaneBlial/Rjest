# Rjest project status

Last updated: 2026-08-31

## The honest headline

Rjest has reached a **usable alpha milestone**. Its directional engineering
readiness is approximately **91%** for the goal of replacing Jest in existing
projects. That 91% is a human assessment of implementation breadth, real-world
evidence, operational maturity, and remaining risk. It is **not** an automated
percentage of the complete Jest API and must not be presented as one.

The automated claim is narrower and reproducible: **286/286 versioned
differential scenarios pass** against pinned official Jest, and the Rust
workspace has **133/133 tests passing**. The repository also contains 25 pinned
real-project corpus reports. Those measurements prove the listed behavior and
the captured projects; they do not prove every unlisted Jest behavior.

## What is complete in this milestone

- Existing suites can exercise the measured Jest core API, expectations,
  snapshots, mocks, fake timers, configuration, CLI, transforms, coverage,
  environments, reporters, resolution, watch behavior, CommonJS, and ESM.
- Unsupported configuration is rejected explicitly instead of being silently
  ignored.
- Every versioned differential fixture runs under official Jest and Rjest and
  compares observable results, status, files, snapshots, or other fixture-level
  evidence.
- Serious React, TypeScript, Node, JSDOM, snapshot, monorepo, npm, pnpm, and
  Yarn/PnP suites have pinned reports under [`docs/corpus`](corpus/).
- `waitForUnhandledRejections` now matches the covered Jest lifecycle across
  test functions and `beforeEach`, `afterEach`, `beforeAll`, and `afterAll`
  hooks, including Jest's default non-waiting behavior.

## What 91% means

The estimate says Rjest is ready for evaluation and practical use on suites
that stay within the documented surface. It does not say that 91% of all Jest
behaviors have been enumerated, nor that any arbitrary project has a 91% chance
of passing. A small unmeasured edge can block an otherwise ordinary project.

Use the numbers separately:

| Signal                | Current result | Meaning                                                           |
| --------------------- | -------------: | ----------------------------------------------------------------- |
| Differential matrix   |    **286/286** | 100% of the bounded, versioned scenarios pass                     |
| Rust tests            |    **133/133** | The current native implementation test suite passes               |
| Real-project evidence | **25 reports** | Pinned suites and exact commands/results, not one aggregate score |
| Directional readiness |       **≈91%** | Engineering estimate, not an exhaustive Jest compatibility metric |

## What remains

- Replace the npm alpha's install-time Rust compilation with signed prebuilt
  binaries for supported macOS, Linux, and Windows targets.
- Broaden custom runner, specialized reporter, watch-plugin, terminal-output,
  Mercurial/Sapling, strict pnpm, PnP fallback, platform glob, and resolver
  combinations.
- Close exact custom-environment VM identity and unusual cross-process global
  identity gaps.
- Add more independent native-ESM, TypeScript, React Native, and monorepo
  corpora and preserve every discovered mismatch as a differential fixture.
- Persist discovery/transform caches and reuse workers. Correctness comes first,
  but cold Node/JSDOM startup remains a major performance cost.
- Re-run controlled benchmarks only after the relevant compatibility surface is
  held constant; Rjest currently makes no general speed claim.

## Adoption guidance

Treat Rjest as a measured alpha, not a universal release-gate replacement yet.
Compare `--listTests`, then run serially, then run in parallel. Keep official
Jest as the final release gate until the exact project has stable parity. If a
mismatch appears, reduce it to one fixture and retain that fixture permanently.

Run the full local evidence gate with:

```sh
make check
```

See the [machine-readable matrix](../compat/jest-compatibility.json), the
[compatibility notes](compatibility.md), and the [migration guide](migration-from-jest.md)
for the exact boundary.

## Milestone decision

This development milestone is complete: the implementation, evidence, public
documentation, and limitations are coherent enough to hand off honestly. The
broader Jest-compatibility mission is not “finished forever”; the items above
are the explicit backlog for future releases.
