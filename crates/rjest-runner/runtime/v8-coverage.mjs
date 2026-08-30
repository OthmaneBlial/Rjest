import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, resolve as resolvePath } from "node:path";

const request = JSON.parse(readFileSync(0, "utf8"));
const requireFromRoot = createRequire(
  resolvePath(request.rootDir, "__rjest_v8_coverage__.cjs")
);

function loadRuntimeTool(specifier) {
  return requireFromRoot(request.runtimeToolPaths?.[specifier] ?? specifier);
}

function normalizedPath(path) {
  return resolvePath(path).replaceAll("\\", "/");
}

function converterSources(filename) {
  const transformed = request.v8Transforms?.[normalizedPath(filename)];
  if (!transformed?.sourceMap) {
    return { source: readFileSync(filename, "utf8") };
  }
  let sourceMap = transformed.sourceMap;
  if (typeof sourceMap === "string") {
    try {
      sourceMap = JSON.parse(sourceMap);
    } catch {
      return { source: readFileSync(filename, "utf8") };
    }
  }
  if (!sourceMap || typeof sourceMap !== "object") {
    return { source: readFileSync(filename, "utf8") };
  }
  return {
    originalSource: transformed.originalSource,
    source: transformed.code,
    sourceMap: { sourcemap: { file: filename, ...sourceMap } },
  };
}

const { mergeProcessCovs } = loadRuntimeTool("@bcoe/v8-coverage");
const loadedConverter = loadRuntimeTool("v8-to-istanbul");
const v8ToIstanbul = loadedConverter?.default ?? loadedConverter;
const { createCoverageMap } = loadRuntimeTool("istanbul-lib-coverage");
const processCoverages = (request.v8Coverage ?? [])
  .filter((result) => Array.isArray(result))
  .map((result) => ({ result }));
const merged = processCoverages.length
  ? mergeProcessCovs(processCoverages)
  : { result: [] };
const coverageMap = createCoverageMap({});

for (const result of merged.result) {
  if (!isAbsolute(result.url)) continue;
  const filename = normalizedPath(result.url);
  const converter = v8ToIstanbul(filename, 0, converterSources(filename));
  await converter.load();
  converter.applyCoverage(result.functions);
  coverageMap.merge(converter.toIstanbul());
}

const coveredFiles = new Set(
  coverageMap.files().map((filename) => normalizedPath(filename))
);
for (const configuredSource of request.coverageSources ?? []) {
  const filename = normalizedPath(configuredSource);
  if (coveredFiles.has(filename)) continue;
  const converter = v8ToIstanbul(filename, 0, {
    source: readFileSync(filename, "utf8"),
  });
  await converter.load();
  converter.applyCoverage([
    {
      functionName: "(empty-report)",
      isBlockCoverage: true,
      ranges: [
        {
          count: 0,
          endOffset: statSync(filename).size,
          startOffset: 0,
        },
      ],
    },
  ]);
  coverageMap.merge(converter.toIstanbul());
  coveredFiles.add(filename);
}

process.stdout.write(JSON.stringify(coverageMap.toJSON()));
