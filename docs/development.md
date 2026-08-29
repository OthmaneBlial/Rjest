# Local development

## Prerequisites

- Rust 1.95 (installed automatically by `rust-toolchain.toml` through rustup)
- Node.js 22 or newer for the upcoming worker runtime
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

Rjest deliberately has no GitHub Actions workflows. Formatting, static checks,
tests, compatibility checks, packaging checks, and benchmarks must remain locally
reproducible.
