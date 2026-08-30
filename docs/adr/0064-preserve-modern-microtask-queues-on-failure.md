# ADR 0064: Preserve modern microtask queues on failure

## Status

Accepted.

## Context

Sinon's modern fake clock accepts any `process.nextTick` or `queueMicrotask`
callback into its job queue. Invalid callbacks fail only when the queue drains.
If any job throws, Sinon does not commit the drain: the complete queue remains,
so earlier jobs and the failing job execute again on the next attempt.

Rjest validated callbacks while scheduling and removed each job before running
it. Invalid callbacks therefore failed too early, and a user exception left
only the unvisited tail of the queue.

## Decision

Modern fake microtasks are stored as Sinon-shaped jobs without eager callback
validation. The drain walks the live queue by index, including nested jobs, and
clears it only after the complete pass succeeds. Callback invocation uses the
same observable property access as Sinon, preserving its runtime TypeErrors.
Legacy fake-timer ticks retain their existing destructive queue behavior.

## Consequences

- Invalid callbacks are counted as pending jobs and fail at drain time.
- A thrown job preserves and replays the entire modern microtask queue.
- Successful drains still include nested jobs and end with an empty queue.
- `process.nextTick` arguments remain forwarded with the compatible receiver.
- A permanent four-test differential fixture covers the contracts.
- The Fake timers category grows from 19 to 20 scenarios, and the complete
  compatibility matrix grows from 222 to 223 scenarios.
