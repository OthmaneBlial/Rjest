# ADR 0002: Main-thread bridge for asynchronous ESM mock factories

- Status: accepted
- Date: 2026-08-29

## Context

Rjest uses Node's synchronous in-process module customization hooks so mock
values can remain in the same JavaScript realm as the test. A synchronous
resolve hook cannot await an asynchronous `jest.unstable_mockModule` factory,
and the generated ESM module cannot declare its exports until that factory has
settled. Moving resolution to Node's asynchronous hook thread would separate it
from test closures and still require cross-thread coordination with the blocked
import.

## Decision

Lexically rewrite dynamic `import()` expressions in file-backed native-ESM
sources so they call the worker's asynchronous import bridge. When the requested
module has a registered mock, the bridge awaits its factory and generates a
data-URL module with the factory object's actual export names.

For an ordinary import, delegate to a virtual module whose URL is anchored at
the original importing file. Its native `import()` preserves Node's relative and
package resolution, conditional exports, and import attributes. The lexical
pass skips strings, comments, regular expressions, and template literal text,
while continuing through template expressions.

Keep synchronous loader hooks for static graphs and already-initialized mocks.
Do not eagerly invoke every registered async factory: Jest initializes factories
lazily, and unused factories may have observable side effects.

## Consequences

- Direct relative, package, and built-in async ESM mocks work without requiring
  users to enable Node's experimental VM modules.
- Successful sequential imports reuse the generated module; rejections are not
  cached; concurrent first imports preserve Jest's observable factory race.
- Ordinary dynamic imports continue through Node's resolver rather than a
  CommonJS approximation.
- Dynamic import rewriting is part of the loader's compatibility surface and
  requires permanent lexical and resolution regression coverage.
- An async mock reached only through another module's static import graph still
  needs a graph-aware initialization path; this ADR does not claim that case.
