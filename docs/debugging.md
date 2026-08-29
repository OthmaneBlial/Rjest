# Debugging

Run the CLI through Cargo while developing:

```sh
cargo run -p rjest-cli -- --showConfig
cargo run -p rjest-cli -- --listTests
cargo run -p rjest-cli -- --runInBand --verbose
cargo run -p rjest-cli -- --json
cargo run -p rjest-cli -- --updateSnapshot
```

Errors retain their causal chain and Rjest rejects unsupported configuration
instead of silently applying the wrong behavior.

Worker errors include the source stack returned by Node. A missing or malformed
protocol result is rejected by Rust rather than being treated as a test failure.
Snapshot mismatches name the exact Jest key. Obsolete entries remain untouched
and fail the run until `--updateSnapshot` explicitly removes them.
