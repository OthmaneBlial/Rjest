# ADR 0033: Treat CLI project paths as an execution matrix

- Status: accepted
- Date: 2026-08-30

## Context

Jest scripts can define projects in configuration or pass them directly as a
variadic `--projects` array. Rjest supported the configuration form after ADR
0032 but still rejected the CLI form, preventing otherwise compatible monorepo
commands from replacing the executable name alone.

Official Jest distinguishes one CLI project from several. One path is loaded as
the primary config and can expand its own root `projects` field. With several
paths, each is an independent child config and the first loaded project supplies
run-wide defaults.

## Decision

Accept one or more path values after `--projects`. Resolve them from the
invocation directory, load directories through normal config discovery and
config files explicitly, and reuse canonical duplicate-config detection.

For a single path, retain ordinary root-project expansion. For multiple paths,
ignore nested global `projects` fields, use every loaded config as a child, and
clone the first child's global-compatible fields into the coordinator config.
When `--config` is also present, retain that explicit config for run-wide
settings and replace only its execution matrix with the selected CLI projects.

## Consequences

- Existing `jest --projects a b` scripts can replace only the runner name.
- Project-specific discovery, transforms, environments, snapshots, and display
  names remain isolated through the existing coordinator path.
- A permanent differential invokes the exact variadic command with one
  directory and one config-file entry.
- `--selectProjects` and `--ignoreProjects` remain separate display-name
  filtering work.
