# Local development

## Prerequisites

- Rust 1.95 (installed automatically by `rust-toolchain.toml` through rustup)
- Node.js 22.18 or newer for the worker runtime and native TypeScript stripping
- npm for the pinned official Jest compatibility oracle
- GNU Make or direct Cargo commands

Clone Jest as a local reference without committing it:

```sh
mkdir -p base
git clone https://github.com/jestjs/jest base/jest
git check-ignore base/jest
```

Run the full local gate:

```sh
make check
```

On the first run, Make uses `npm ci` to install the exact Jest and Babel versions
from `package-lock.json`. `npm run compat` can then run only the differential
fixtures after building `target/debug/rjest`.

Rjest deliberately has no GitHub Actions workflows. Formatting, static checks,
tests, compatibility checks, packaging checks, and benchmarks must remain locally
reproducible.
