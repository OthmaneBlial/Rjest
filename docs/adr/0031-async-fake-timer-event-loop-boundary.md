# ADR 0031: Yield to the native event loop in asynchronous timer drains

- Status: accepted
- Date: 2026-08-30

## Context

Rjest's modern `runAllTimersAsync` selected and ran the next fake timer
immediately, drained fake `queueMicrotask` callbacks inside that timer, and then
awaited a resolved promise. That ordering can run fake microtasks before native
promise assimilation jobs. React 19 observes the difference in async `act`
tracking and reports an un-awaited act warning that official Jest does not.

Jest's modern fake-timer implementation delegates to Sinon's asynchronous
clock drain. It crosses an original native-timer boundary before executing each
queued fake timer, allowing native promise work to settle first.

## Decision

Before selecting each fake timer in `runAllTimersAsync`, await a zero-delay call
through the captured native `setTimeout`. Then execute the fake timer and its
fake tick queue. Once no timers remain, drain any remaining fake ticks.

Preserve timer-limit enforcement, stable timer ordering, intervals, and the
separate synchronous `runAllTimers` behavior.

## Consequences

- Native promise assimilation precedes fake queued microtasks at the same point
  as official Jest's asynchronous timer drain.
- React 19 async `act` no longer observes a Rjest-only warning in the pinned
  React Navigation suite.
- Each asynchronous timer step deliberately incurs a native event-loop turn;
  correctness takes priority over eliminating that boundary.
- A focused thenable/microtask differential preserves the ordering without
  depending on React internals.
