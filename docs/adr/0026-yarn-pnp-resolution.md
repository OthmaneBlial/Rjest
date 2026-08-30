# ADR 0026: Resolve Yarn Plug'n'Play packages through the active runtime

- Status: accepted
- Date: 2026-08-30

## Context

Yarn Plug'n'Play removes the ordinary `node_modules` tree and exposes package
locations through a generated `.pnp.cjs` preload and the special `pnpapi`
module. Falling back to ancestor directory scans can accidentally load Rjest's
own dependencies, violates PnP's declared-dependency boundary, and cannot
reliably select conditional package exports.

Modern Node customization hooks add another boundary. Node 25 sends both ESM
imports and CommonJS `require` calls through the synchronous resolve hook. A
resolver that treats every hook call as ESM selects the wrong conditional
export for `createRequire`, setup modules, and mixed module graphs.

## Decision

Only enable PnP resolution when the process reports `process.versions.pnp` and
the special `pnpapi` module can be loaded from the test runtime. Resolve source
requests with `pnpapi.resolveRequest`, Rjest's configured extension order, and
the same Jest-shaped condition sets used by the ordinary resolver. Detect
CommonJS hook requests from Node's `require` condition and preserve mode-specific
URLs and module generation behavior.

Keep built-ins and URL-scheme specifiers outside the PnP bridge. Guard the call
against recursive resolution because loading and consulting the PnP runtime can
itself cross Node's hook. Surface PnP errors instead of falling back to Rjest's
root `NODE_PATH`; dependency isolation is part of the package-manager contract.

The differential harness uses an exact development dependency on Yarn 4's
bundled CLI to generate `.pnp.cjs` independently inside each temporary Jest and
Rjest fixture. All fixture dependencies are local portals, so the oracle is
deterministic and does not require registry or network access.

## Consequences

- Static and dynamic native ESM imports, CommonJS `createRequire`, conditional
  exports, and `unstable_mockModule` use the same PnP package identities.
- Undeclared transitive imports retain Yarn's error instead of escaping into
  Rjest's installation tree.
- The harness validates official Jest and Rjest from separate generated PnP
  installations on every compatibility run.
- The pinned Granite corpus additionally proves zip-backed packages, a Yarn 4
  workspace, Haste platform extensions, and a configured React Native resolver
  that delegates back to the default resolver.
- Rjest-owned resolver and snapshot tools use canonical runner paths rather than
  escaping or weakening the project's declared-dependency boundary.
- Other PnP fallback modes, pnpm layouts, and broader configured-resolver option
  combinations still need independent corpus evidence.
