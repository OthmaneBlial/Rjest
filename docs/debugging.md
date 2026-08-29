# Debugging

Run the CLI through Cargo while developing:

```sh
cargo run -p rjest-cli -- --showConfig
cargo run -p rjest-cli -- --listTests
```

Errors retain their causal chain and Rjest rejects unsupported configuration
instead of silently applying the wrong behavior.
