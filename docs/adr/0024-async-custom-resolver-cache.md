# ADR 0024: Prepare async custom resolution before native ESM evaluation

- Status: accepted
- Date: 2026-08-30

## Context

Jest permits a custom resolver object with only an asynchronous hook. CommonJS
cannot await it and therefore retains default synchronous resolution, but
native ESM awaits the hook for both static and dynamic imports. Node's
in-process customization hook is synchronous, so invoking the async resolver
from that hook is impossible.

Rjest already scans and prepares reachable ESM graphs before evaluation so it
can handle asynchronous transforms and ESM mock factories. That phase has the
importer and source specifier needed for asynchronous resolution.

## Decision

During ESM graph preparation, await the configured async resolver with the same
Jest-shaped import conditions and default callbacks used by synchronous custom
resolution. Cache each outcome by normalized importer path, specifier, and
resolution mode. The synchronous Node hook consumes the cached canonical path
when the graph is evaluated.

Rewritten dynamic imports use the same sequence: prepare and cache the reachable
target first, then delegate the actual import to Node. `@jest/globals` and
Rjest's internal bridge modules remain internal and do not enter the user
resolver. When a resolver exports only `async`, CommonJS continues through the
ordinary synchronous resolver, matching Jest.

## Consequences

- Async-only hooks work for static and dynamic native-ESM imports without
  blocking or emulating asynchronous behavior inside Node's sync hook.
- Dual/function resolvers also receive an asynchronous ESM preparation call,
  while CommonJS remains synchronous.
- Resolver results are stable across the preparation/evaluation boundary and
  keyed by the importing module rather than globally by package name.
- Mock-aware async custom-resolution edge cases and mutable resolver options
  still require additional differential probes.
