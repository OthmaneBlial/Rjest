# ADR 0020: Format inline snapshot writes with project Prettier

- Status: accepted
- Date: 2026-08-30

## Context

Jest does more than insert an inline snapshot template literal. When its
configured `prettierPath` resolves, Jest first formats the complete test file
and then adjusts the raw template node so Prettier does not collapse or
re-indent the multiline snapshot content. Projects therefore observe source
changes that depend on their installed Prettier version and configuration.

Prettier 2 exposes synchronous formatting and accepts a custom parser wrapper.
Prettier 3 makes formatting asynchronous and requires its private parse and AST
format operations for Jest's two-stage rewrite. Treating both versions as the
same API produces different source or fails on TypeScript syntax.

## Decision

Normalize Jest's default `prettier` lookup, explicit `prettierPath` module or
file references, and the explicit `null` opt-out. Carry the normalized value in
worker protocol v17 and load it outside the test module-mocking system, relative
to the source file.

After Babel inserts the snapshot, apply the project configuration and inferred
parser. For Prettier 2, run Jest's two synchronous format passes with a custom
parser that mutates the snapshot template AST. For Prettier 3, await the first
format, parse its private AST, traverse it with Babel's scope-free type walker,
adjust the raw template indentation, and format that AST. If the default
optional module is unavailable, preserve the Babel-only source rewrite.

Keep exact rewritten-source comparisons against official Jest for both major
versions in the compatibility harness.

## Consequences

- Existing project quote, wrapping, tab, width, and parser settings participate
  in inline snapshot updates as they do under Jest.
- CommonJS, native ESM, transformed JavaScript, and TypeScript use the same
  project-relative formatting path.
- Rjest does not take a runtime dependency on Prettier; the tested versions are
  development dependencies used by the differential oracle.
- Prettier's private version-3 AST interface requires new differential probes
  when future major versions change that contract.
