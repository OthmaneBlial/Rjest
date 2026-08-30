# ADR 0059: Support modern Node timer handles

## Status

Accepted.

## Context

Modern Jest fake timers use Sinon, which follows the host timer contract. In a
Node environment, `setTimeout`, `setInterval`, and `setImmediate` return object
handles with reference state, numeric coercion, and `refresh`. In JSDOM they
return browser-style numbers.

Rjest returned numbers in both environments. Node libraries that call
`unref()`, inspect `hasRef()`, or extend a timeout with `refresh()` therefore
failed even though the scheduled callback itself was compatible.

## Decision

Rjest now returns a Sinon-shaped object for modern Node timers. Each handle
supports `ref`, `unref`, `hasRef`, `refresh`, a public `refed` state, and
`Symbol.toPrimitive` numeric conversion. Clear APIs accept either the handle or
its numeric value.

Timer records carry an explicit scheduling order. Refresh recomputes the next
deadline from the current fake time, moves the timer behind existing work at an
equal deadline, and can reactivate a fired or cleared timer. Interval execution
also advances scheduling order. Each fake-clock installation has a generation,
so refreshing a handle from an obsolete clock cannot inject work into the new
clock. JSDOM continues returning numbers.

## Consequences

- Node packages can use the normal timeout/interval/immediate handle protocol
  under modern fake timers.
- Ref state is observable without changing timer execution.
- Refresh behavior and equal-deadline ordering match Jest/Sinon.
- Reinstalled clocks are isolated from stale handles.
- Browser/JSDOM identifier behavior remains unchanged.
- A permanent eight-test differential fixture covers Node and JSDOM.
- The Fake timers category grows from 14 to 15 scenarios, and the complete
  compatibility matrix grows from 217 to 218 scenarios.
