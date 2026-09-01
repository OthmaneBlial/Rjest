import assert from "node:assert/strict";
import { constants, accessSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

test("publishes the alpha under the public rjest package name", () => {
  assert.equal(manifest.name, "rjest");
  assert.equal(manifest.version, "0.1.0-alpha.1");
  assert.equal(manifest.private, undefined);
  assert.equal(manifest.bin.rjest, "bin/rjest.mjs");
  assert.equal(manifest.publishConfig.access, "public");
  assert.equal(manifest.publishConfig.tag, "alpha");
});

test("ships the Rust workspace needed by the installation build", () => {
  const files = new Set(manifest.files);
  for (const required of [
    "bin/rjest.mjs",
    "scripts/npm-install.mjs",
    "crates",
    "Cargo.toml",
    "Cargo.lock",
    "rust-toolchain.toml",
  ]) {
    assert.ok(files.has(required), `missing npm file entry: ${required}`);
  }
  assert.equal(manifest.scripts.postinstall, "node scripts/npm-install.mjs");
});

test("marks the command wrapper executable on Unix", () => {
  if (process.platform !== "win32") {
    accessSync(join(root, manifest.bin.rjest), constants.X_OK);
  }
});
