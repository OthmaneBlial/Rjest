# ADR 0049: Match Jest's interactive watch interruption lifecycle

- Status: accepted
- Date: 2026-08-30

## Context

Rjest's original native watch loop waited synchronously for every test cycle to
finish. It could react to filesystem changes between cycles, but a user could
not stop a blocked worker or change the active watch filter from the terminal.

Official Jest makes a distinction that is easy to miss. Filesystem callbacks
call `startRun`, which returns immediately while another run is active. An
actionable key such as Enter, `q`, `a`, `o`, or `f` instead marks the current
`TestWatcher` as interrupted and returns without applying that key's ordinary
action. The user presses a second key after the run becomes idle.

## Decision

Rjest enables raw terminal input only when stdin is a TTY and multiplexes it
with native filesystem events while a test cycle runs on a scoped coordinator
thread.

An actionable key cancels the active cycle and is consumed. A cloneable
run-wide cancellation token propagates into the Rust runner, stops queued work,
and forcibly terminates active Node worker processes. Once idle, the next key
can select all, changed, or failed tests; clear filters; prompt for a filename
or test name; update snapshots once; rerun; or exit.

Filesystem events are remembered but do not cancel active workers. The current
cycle finishes, then discovery and selection run again. This matches Jest's
observed `isRunning` guard instead of implementing a more aggressive but
incompatible stale-run policy.

## Consequences

- A blocked parallel watch worker can be stopped promptly from a real terminal.
- Active key presses and filesystem writes preserve Jest's different lifecycle
  semantics.
- Terminal raw mode is restored through a guard, including error and exit paths.
- Watch plugins and exact typeahead/rendering behavior remain future work.
- A Python PTY bridge in the compatibility harness gives official Jest and
  Rjest the same interactive terminal and permanently tests interrupt, rerun,
  and quit behavior.
