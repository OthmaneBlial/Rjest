# NVIDIA Nsight VS Code language-support compatibility corpus

NVIDIA Nsight Visual Studio Code Edition is an independent TypeScript/ESM
extension project. Its isolated language-support suite exercises Jest 30, an
ESM custom environment, a native TypeScript transformer, an ESM setup module,
module mapping, extensionless TypeScript imports, filesystem behavior, and
substantial mock usage without requiring CUDA-GDB or a GPU.

## Reproduction target

- Repository: <https://github.com/NVIDIA/nsight-vscode-edition>
- Commit: `9caf33029cc0eccd0e44a7ddbf894e7ad200ea5c`
- Lockfile SHA-256: `9686385c068528ada850ffdf7234f44dcbaf8f9bb08a0b1419f8e739d9b4fb2e`
- Install command: `npm ci`
- Original suite command: `npm run test:language-support`
- Runtime: Node 25.9.0 and npm 11.12.1
- Project version: 2026.1.0
- Locked Jest: 30.0.0

The checkout, test files, Jest configuration, environment, transformer, setup
module, and lockfile remain unmodified. The project's `.npmrc` supplies the
native TypeScript and VM-module Node options whenever the suite is launched
through npm.

## Exact result

| Measurement | Official Jest | Rjest |
| --- | ---: | ---: |
| Discovered suites | 8 | 8 |
| Passing / failing suites | 7 / 1 | 7 / 1 |
| Registered tests | 95 | 95 |
| Passing / failing tests | 94 / 1 | 94 / 1 |
| Snapshots | 0 | 0 |
| Exit code | 1 | 1 |

The one failure is the same upstream macOS path assertion under both runners:
`fs.realpath()` returns a `/private/var/...` path while the expected temporary
directory begins with `/var/...`. The reusable comparator found exact suite
paths, exact test names and statuses, exact snapshot totals, and zero Rjest
file errors. This is strict parity for the unchanged suite, including its
known platform-specific failure; it is not presented as a passing upstream
run.

The captured official run reported 1.033 seconds (1.71 seconds wall and
263,929,856-byte peak RSS). Rjest reported 3.498 seconds (4.76 seconds wall and
135,348,224-byte peak RSS). Rjest was 3.39 times slower by reported runner
time and 2.78 times slower by wall time, while using 0.51 times the peak RSS in
these single measurements. This is compatibility evidence, not a controlled
benchmark.

## Compatibility work found by the corpus

The first zero-change Rjest run stopped during configuration. Progressing
through the unchanged suite exposed and repaired five reusable gaps:

- project-level `silent` configuration now reaches the reporter;
- implicit `.mts` config discovery follows the installed Jest version, so the
  Jest 30.0 `.mjs` wrapper layout is not misclassified as two configs;
- Node 25 loader hooks normalize absolute CommonJS requests that have no
  `parentURL` instead of throwing `ERR_INVALID_URL`;
- after native ESM resolution fails, Jest-style resolution can find an
  extensionless transformed TypeScript dependency such as `./providers`;
- custom-environment events expose Jest's `ROOT_DESCRIBE_BLOCK` name and an
  `undefined` root parent.

The first run after those fixes reproduced all 95 official outcomes exactly.
Each deterministic runtime behavior is also covered by the committed
differential or Rust regression suite.

## Commands

The checkout and machine-readable results live under ignored `base/corpus`:

```sh
cd base/corpus/nsight-vscode-edition
npm ci
npm run test:language-support -- \
  --json --outputFile=../results/nsight-vscode-language/official-node25.json
npm exec -- ../../../target/debug/rjest \
  test/languageSupport --runInBand --json \
  --outputFile=../results/nsight-vscode-language/rjest-zero-change-node25.json
cd ../../..
npm run compare:corpus -- \
  --root base/corpus/nsight-vscode-edition \
  base/corpus/results/nsight-vscode-language/official-node25.json \
  base/corpus/results/nsight-vscode-language/rjest-zero-change-node25.json
```

## Compatibility result

This corpus independently proves zero-source-change semantic parity for the
pinned language-support suite. It does not prove the extension's CUDA-GDB
debugger suites, VS Code extension-host tests, coverage, or unrelated Jest
projects.
