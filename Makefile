.PHONY: check compat deps fmt lint test

check: fmt lint test compat

deps: node_modules/.package-lock.json

node_modules/.package-lock.json: package-lock.json
	npm ci

compat: deps
	npm run check:runtime
	cargo build -p rjest-cli
	npm run compat

fmt:
	cargo fmt --all -- --check

lint:
	cargo clippy --workspace --all-targets --all-features -- -D warnings

test:
	cargo test --workspace --all-features
