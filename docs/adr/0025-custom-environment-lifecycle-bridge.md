# ADR 0025: Bridge custom Jest environment lifecycle into file workers

- Status: accepted
- Date: 2026-08-30

## Context

Jest environment modules are extension points, not only names selecting Node or
JSDOM. A class receives normalized global/project configuration and per-file
context, owns a `global`, may expose custom export conditions, performs async
setup and teardown, and can observe awaited `jest-circus` events. Existing
projects often subclass `jest-environment-node` or `jest-environment-jsdom`.

Rjest currently compiles runtime modules in an isolated Node file process. It
does not evaluate its CommonJS and transformed-module pipeline inside the VM
context returned by an arbitrary environment. Rejecting custom classes blocks
ecosystem adoption, while pretending their `getVmContext()` controls execution
would be inaccurate.

## Decision

Normalize explicit and package test-environment references and implement Jest's
`jest-environment-<name>` lookup preference in each worker. Load CommonJS or
top-level-await ESM constructors before resolver and transformer setup. Supply
Jest-shaped project/global config plus console, docblock pragmas, and test path;
require the post-Jest-27 `getVmContext()` contract.

Project environment globals into the isolated worker through live accessors at
constructor, setup, and event boundaries. Keep the worker realm's ECMAScript
intrinsics so literals and matcher constructors do not acquire mixed-realm
`instanceof` failures. Preserve environment-owned browser globals and values
added during setup or event handling. Because the current bridge shares the
host process realm, retain the host's performance, timer, immediate, and
microtask functions instead of projecting JSDOM wrappers that call those same
host names and recurse. The environment's `window` retains its browser-facing
versions. Use a Jest-compatible internal root `beforeEach` hook so custom
handlers observe mock-lifecycle ordering.

Dispatch definition, run, describe, hook, test, skip/todo, success/failure, and
teardown events. Await asynchronous circus events and always invoke environment
teardown, including when setup or an event fails. Consult `exportConditions()`
before resolving user modules.

## Consequences

- Common Node/JSDOM environment subclasses can expose globals and observe the
  covered Jest lifecycle without changing tests.
- CommonJS and top-level-await ESM environments share the same contract.
- Differential artifacts prove the complete tracked event order and teardown,
  not merely a passing test body.
- `getVmContext()` is validated but does not yet become the module execution
  realm. Custom environments that depend on exact VM intrinsic identity or
  mutate obscure circus state may still differ and remain documented as open.
