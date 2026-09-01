import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const benchmarkDir = dirname(fileURLToPath(import.meta.url));
export const generatedDir = join(benchmarkDir, "generated");

const workloads = [
  {
    id: "startup",
    name: "Cold start",
    description: "one Node test file and one assertion",
    mode: "serial",
    expectedSuites: 1,
    expectedTests: 1,
  },
  {
    id: "assertions",
    name: "Assertion throughput",
    description: "50,000 Jest-style equality assertions in one file",
    mode: "serial",
    expectedSuites: 1,
    expectedTests: 1,
  },
  {
    id: "many-files",
    name: "Many files",
    description: "48 files and 384 tests across four workers",
    mode: "parallel",
    workers: 4,
    expectedSuites: 48,
    expectedTests: 384,
  },
  {
    id: "discovery",
    name: "Discovery",
    description: "list 1,500 test files without executing them",
    mode: "list",
    expectedSuites: 1_500,
    expectedTests: 0,
  },
];

export async function generateWorkloads() {
  await rm(generatedDir, { recursive: true, force: true });
  await mkdir(generatedDir, { recursive: true });
  for (const workload of workloads) {
    await generateWorkload(workload);
  }
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    workloads: workloads.map((workload) => ({
      ...workload,
      directory: join(generatedDir, workload.id),
      config: join(generatedDir, workload.id, "jest.config.cjs"),
    })),
  };
  await writeFile(
    join(generatedDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

async function generateWorkload(workload) {
  const root = join(generatedDir, workload.id);
  const tests = join(root, "tests");
  await mkdir(tests, { recursive: true });
  await Promise.all([
    writeFile(
      join(root, "package.json"),
      '{"private":true,"type":"commonjs"}\n',
    ),
    writeFile(
      join(root, "jest.config.cjs"),
      "module.exports = {testEnvironment: 'node', testMatch: ['<rootDir>/tests/**/*.test.cjs']};\n",
    ),
  ]);
  if (workload.id === "startup") {
    await writeFile(
      join(tests, "startup.test.cjs"),
      "test('adds two integers', () => expect(20 + 22).toBe(42));\n",
    );
    return;
  }
  if (workload.id === "assertions") {
    await writeFile(
      join(tests, "assertions.test.cjs"),
      [
        "test('checks a deterministic integer pipeline', () => {",
        "  for (let index = 0; index < 50_000; index += 1) {",
        "    expect((index * 17 + 11) % 97).toBe((index * 17 + 11) % 97);",
        "  }",
        "});",
        "",
      ].join("\n"),
    );
    return;
  }
  if (workload.id === "many-files") {
    await writeFilesInBatches(
      Array.from({ length: 48 }, (_, fileIndex) => ({
        path: join(
          tests,
          `unit-${String(fileIndex).padStart(3, "0")}.test.cjs`,
        ),
        source: `${Array.from(
          { length: 8 },
          (_, testIndex) =>
            `test('unit ${fileIndex} case ${testIndex}', () => expect((${fileIndex} + ${testIndex}) * 3).toBe(${(fileIndex + testIndex) * 3}));`,
        ).join("\n")}\n`,
      })),
    );
    return;
  }
  await writeFilesInBatches(
    Array.from({ length: 1_500 }, (_, index) => ({
      path: join(tests, `feature-${String(index).padStart(4, "0")}.test.cjs`),
      source: `test('feature ${index}', () => expect(${index}).toBe(${index}));\n`,
    })),
  );
}

async function writeFilesInBatches(files) {
  const batchSize = 100;
  for (let start = 0; start < files.length; start += batchSize) {
    await Promise.all(
      files
        .slice(start, start + batchSize)
        .map((file) => writeFile(file.path, file.source)),
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const manifest = await generateWorkloads();
  process.stdout.write(
    `Generated ${manifest.workloads.length} workloads in ${generatedDir}\n`,
  );
}
