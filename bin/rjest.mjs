#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const executableName = process.platform === "win32" ? "rjest.exe" : "rjest";
const nativeBinary = join(packageRoot, "native", executableName);

if (!existsSync(nativeBinary)) {
  console.error(
    "Rjest's native binary is missing. Run `npm rebuild rjest` after installing Rust 1.85 or newer."
  );
  process.exit(1);
}

const child = spawn(nativeBinary, process.argv.slice(2), {
  stdio: "inherit",
  env: {
    ...process.env,
    RJEST_INTERNAL_NODE_MODULES:
      process.env.RJEST_INTERNAL_NODE_MODULES ||
      join(packageRoot, "node_modules"),
  },
});

child.on("error", (error) => {
  console.error(`Unable to start Rjest: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
