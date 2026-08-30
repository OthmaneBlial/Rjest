# React Navigation compatibility corpus

React Navigation is a production TypeScript monorepo whose original Jest
configuration runs two inline projects: a React Native project based on the
React Native Jest preset and a web project using JSDOM. The suite exercises pnpm
workspace resolution, Babel TSX transforms, setup files, custom export
conditions, React Testing Library, browser history, mocks, modern fake timers,
and snapshots.

## Reproducible revision

- Repository: `https://github.com/react-navigation/react-navigation.git`
- Revision: `ab1319d6bbf05eae8dc25e33cbf4dc56494e0f0c`
- Node: `25.9.0`
- Package manager: pnpm `11.13.1`
- Jest package constraint: `~30.4.2`
- Installed Jest CLI version: `30.4.1`
- Lockfile SHA-256:
  `349a893329b9a2b232186818660f9add57b7f75de9afc6250299967c3a0c7349`

The checkout and captures stay ignored under `base/corpus`. Install the exact
dependency graph without changing the lockfile:

```bash
cd base/corpus/react-navigation
npx --yes pnpm@11.13.1 install --frozen-lockfile
```

## Commands

Run the unchanged two-project configuration with official Jest:

```bash
/usr/bin/time -l -o ../results/react-navigation/official.time.log \
  ./node_modules/.bin/jest --runInBand --json \
  --outputFile=../results/react-navigation/official.json
```

Run the same configuration from the same project root with Rjest:

```bash
/usr/bin/time -l -o ../results/react-navigation/rjest-final.time.log \
  /absolute/path/to/rjest --runInBand --json \
  --outputFile=../results/react-navigation/rjest-final.json
```

Compare the complete captures:

```bash
npm run compare:corpus -- \
  --root base/corpus/react-navigation \
  base/corpus/results/react-navigation/official.json \
  base/corpus/results/react-navigation/rjest-final.json
```

## Result

| Signal | Official Jest | Rjest |
| --- | ---: | ---: |
| Suites | 79 passed, 2 failed / 81 | 79 passed, 2 failed / 81 |
| Tests | 1,301 passed, 2 failed / 1,303 | 1,301 passed, 2 failed / 1,303 |
| Snapshots | 169 matched / 169 | 169 matched / 169 |
| Exit code | 1 | 1 |
| Runner-reported time | 103.878 s | 183.845 s |
| End-to-end wall time | 107.12 s | 184.09 s |
| Peak RSS | 1,387,397,120 bytes | 1,590,935,552 bytes |

The automated comparator reports exact suite paths, 1,303/1,303 test identity
parity, 1,303/1,303 identity/status parity, exact snapshot counts, and zero
Rjest file errors. The two failures are the same tests in both runners:
`useOnAction.test.tsx` and `useNavigationState.test.tsx` fail because the
unchanged suite calls `window.dispatchEvent` in the native project under Node
25. They are retained as part of the official oracle rather than hidden or
patched.

In these single serial captures Rjest is about 1.72 times slower by wall time
and uses about 14.7% more peak RSS. These figures describe this pinned run, not
a general benchmark claim.

## Compatibility work exposed by React Navigation

The first Rjest run discovered the exact 81 files but failed before registering
tests because a bare `babel-jest` transformer resolved to Rjest's ancestor copy.
Rjest now resolves that transformer through the project's installed Jest
dependency graph. A hostile-ancestor differential fixture preserves the fix.

The project-local Babel pipeline then could not resolve
`react-native-worklets/plugin`. The pnpm-generated Jest wrapper exposes
`node_modules/.pnpm/node_modules` through `NODE_PATH`; invoking the native Rjest
binary bypassed that wrapper. Rjest workers now add an existing pnpm virtual
hoist directory automatically, and an isolated differential fixture proves the
lookup.

Those fixes left one Rjest-only failure in an async fake-timer test. Official
modern fake timers yield through a native event-loop turn before each timer,
allowing native promise assimilation to precede queued fake microtasks. Rjest's
`runAllTimersAsync` now follows that ordering, with both a focused differential
and the original 45-test React Navigation file retaining the regression.

This result proves the original selected Jest configuration at the pinned
revision. It does not establish compatibility for every package script,
platform build, typecheck, lint rule, native device integration, or a pnpm
isolated-linker installation.
