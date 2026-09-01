import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceCheckout =
  resolve(process.env.INIT_CWD || "") === packageRoot &&
  existsSync(join(packageRoot, ".git"));

if (sourceCheckout) {
  console.log(
    "Rjest source checkout detected; native npm installation build skipped."
  );
  process.exit(0);
}

const cargo = spawnSync("cargo", ["--version"], { encoding: "utf8" });
if (cargo.error || cargo.status !== 0) {
  console.error(
    "Rjest alpha compiles its native binary during installation. Install Rust 1.85 or newer from https://rustup.rs and run `npm rebuild rjest-runner`."
  );
  process.exit(1);
}

const buildDirectory = mkdtempSync(join(tmpdir(), "rjest-npm-build-"));
const executableName = process.platform === "win32" ? "rjest.exe" : "rjest";
const builtBinary = join(buildDirectory, "release", executableName);
const installedBinary = join(packageRoot, "native", executableName);

console.log("Building the Rjest native coordinator for this machine...");

try {
  const build = spawnSync(
    "cargo",
    ["build", "--release", "--locked", "--package", "rjest-cli"],
    {
      cwd: packageRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        CARGO_INCREMENTAL: "0",
        CARGO_TARGET_DIR: buildDirectory,
      },
    }
  );

  if (build.error || build.status !== 0 || !existsSync(builtBinary)) {
    console.error(
      "Rjest native compilation failed; npm installation cannot continue."
    );
    process.exitCode = build.status || 1;
  } else {
    mkdirSync(dirname(installedBinary), { recursive: true });
    copyFileSync(builtBinary, installedBinary);
    if (process.platform !== "win32") chmodSync(installedBinary, 0o755);
    console.log("Rjest native coordinator installed.");
  }
} finally {
  rmSync(buildDirectory, { recursive: true, force: true });
}
