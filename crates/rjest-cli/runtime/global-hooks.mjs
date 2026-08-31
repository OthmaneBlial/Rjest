import {readFileSync} from 'node:fs';
import Module, {createRequire} from 'node:module';
import {delimiter, dirname, extname, isAbsolute, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline';

const PREFIX = '__RJEST_GLOBAL_HOOK__';
const initialEnvironment = {...process.env};

await main();

async function main() {
  const lines = createInterface({input: process.stdin, crlfDelay: Infinity});
  const iterator = lines[Symbol.asyncIterator]();
  const initial = await iterator.next();
  if (initial.done) return;

  let request;
  try {
    request = JSON.parse(initial.value);
    await runHooks(request.globalSetups, request.globalConfig, 'globalSetup', request);
    respond({ok: true, environment: environmentDelta()});
  } catch (error) {
    respond({ok: false, error: formatError(error)});
    return;
  }

  const final = await iterator.next();
  if (final.done) return;
  try {
    const command = JSON.parse(final.value);
    if (command.action === 'globalTeardown') {
      await runHooks(
        request.globalTeardowns,
        request.globalConfig,
        'globalTeardown',
        request,
      );
    } else if (command.action !== 'close') {
      throw new TypeError(`unknown global hook action ${String(command.action)}`);
    }
    respond({ok: true, environment: environmentDelta()});
  } catch (error) {
    respond({ok: false, error: formatError(error)});
  }
}

async function runHooks(entries, globalConfig, moduleName, request) {
  for (const entry of entries) {
    const modulePath = await resolveHook(entry.modulePath, entry.projectConfig);
    try {
      const runtime = await createTransformRuntime(entry, request);
      try {
        const loaded = await runtime.load(modulePath);
        let hook = loaded?.default ?? loaded;
        if (typeof hook !== 'function' && typeof hook?.default === 'function') {
          hook = hook.default;
        }
        if (typeof hook !== 'function') {
          throw new TypeError(
            `${moduleName} file must export a function at ${modulePath}`,
          );
        }
        await hook(globalConfig, entry.projectConfig);
      } finally {
        runtime.restore();
      }
    } catch (error) {
      throw globalHookError(moduleName, modulePath, error);
    }
  }
}

async function resolveHook(specifier, config) {
  if (isAbsolute(specifier)) return specifier;
  const rootDir = config.rootDir;
  const rootRequire = createRequire(resolve(rootDir, 'package.json'));
  const customResolver = config.resolver
    ? await loadCustomResolver(config.resolver, rootDir)
    : undefined;
  const defaultResolver = (request, options = {}) => {
    const basedir = options.basedir ?? rootDir;
    return createRequire(resolve(basedir, 'package.json')).resolve(request);
  };
  const resolverOptions = {
    basedir: rootDir,
    conditions: undefined,
    defaultAsyncResolver: async (request, options) =>
      defaultResolver(request, options),
    defaultResolver,
    extensions: (config.moduleFileExtensions ?? []).map(extension => `.${extension}`),
    moduleDirectory: config.moduleDirectories,
    paths: config.modulePaths?.length
      ? config.modulePaths
      : process.env.NODE_PATH?.split(delimiter).filter(Boolean),
    rootDir,
  };
  if (customResolver) {
    const resolved = customResolver(specifier, resolverOptions);
    if (resolved && typeof resolved.then === 'function') {
      throw new TypeError(
        `Custom resolver returned a promise while resolving ${specifier} synchronously`,
      );
    }
    if (resolved) return resolved;
  }
  return rootRequire.resolve(specifier);
}

async function loadCustomResolver(specifier, rootDir) {
  const rootRequire = createRequire(resolve(rootDir, 'package.json'));
  const modulePath = rootRequire.resolve(specifier);
  const loaded = await loadModule(modulePath, rootDir);
  const exported = loaded?.default ?? loaded;
  if (typeof exported === 'function') return exported;
  if (typeof exported?.sync === 'function') return exported.sync;
  if (typeof loaded?.sync === 'function') return loaded.sync;
  if (typeof exported?.async === 'function' || typeof loaded?.async === 'function') {
    return undefined;
  }
  throw new TypeError(
    `Resolver located at ${modulePath} does not export a function or an object with "sync" and "async" props`,
  );
}

async function loadModule(modulePath, rootDir) {
  if (['.mjs', '.mts'].includes(extname(modulePath))) {
    return import(pathToFileURL(modulePath).href);
  }
  const rootRequire = createRequire(resolve(rootDir, 'package.json'));
  try {
    return rootRequire(modulePath);
  } catch (error) {
    if (error?.code !== 'ERR_REQUIRE_ESM' && error?.code !== 'ERR_REQUIRE_ASYNC_MODULE') {
      throw error;
    }
    return import(pathToFileURL(modulePath).href);
  }
}

async function createTransformRuntime(entry, request) {
  const config = entry.projectConfig;
  const transformers = [];
  for (const [pattern, configured] of Object.entries(config.transform ?? {})) {
    transformers.push(
      await loadTransformer(pattern, configured, config, request.runtimeToolPaths),
    );
  }
  if (transformers.length === 0 && !entry.transformConfigured) {
    const fallback = request.runtimeToolPaths?.['babel-jest'];
    if (fallback) {
      transformers.push(
        await loadTransformer(
          '^.+\\.[jt]sx?$',
          fallback,
          config,
          request.runtimeToolPaths,
        ),
      );
    }
  }

  const originalExtensions = new Map(Object.entries(Module._extensions));
  const extensions = new Set(
    (config.moduleFileExtensions ?? []).map(extension => `.${extension}`),
  );
  extensions.add('.js');
  extensions.add('.cjs');

  const selectedTransformer = filename => {
    const normalized = filename.replaceAll('\\', '/');
    if (
      (config.transformIgnorePatterns ?? []).some(pattern =>
        new RegExp(pattern).test(normalized),
      )
    ) {
      return undefined;
    }
    return transformers.find(transformer => transformer.pattern.test(normalized));
  };

  const compileDependency = (module, filename) => {
    const selected = selectedTransformer(filename);
    if (!selected) {
      const extension = extname(filename);
      const original =
        originalExtensions.get(extension) ??
        (extension === '.cjs' ? originalExtensions.get('.js') : undefined);
      if (original) return original(module, filename);
      const source = readFileSync(filename, 'utf8');
      module._compile(source, filename);
      return;
    }
    const source = readFileSync(filename, 'utf8');
    const code = transformSourceSync(selected, source, filename, config);
    module._compile(code, filename);
  };

  for (const extension of extensions) {
    if (!['.json', '.node', '.mjs'].includes(extension)) {
      Module._extensions[extension] = compileDependency;
    }
  }

  return {
    async load(modulePath) {
      const selected = selectedTransformer(modulePath);
      if (!selected) return loadModule(modulePath, config.rootDir);
      if (Module._cache[modulePath]) return Module._cache[modulePath].exports;
      const source = readFileSync(modulePath, 'utf8');
      const code = await transformSource(selected, source, modulePath, config);
      const loaded = new Module(modulePath);
      loaded.filename = modulePath;
      loaded.paths = Module._nodeModulePaths(dirname(modulePath));
      Module._cache[modulePath] = loaded;
      try {
        loaded._compile(code, modulePath);
        loaded.loaded = true;
        return loaded.exports;
      } catch (error) {
        delete Module._cache[modulePath];
        throw error;
      }
    },
    restore() {
      for (const extension of extensions) {
        const original = originalExtensions.get(extension);
        if (original) Module._extensions[extension] = original;
        else delete Module._extensions[extension];
      }
    },
  };
}

async function loadTransformer(pattern, configured, config, runtimeToolPaths) {
  const [moduleName, transformerConfig] = Array.isArray(configured)
    ? configured
    : [configured, {}];
  if (typeof moduleName !== 'string') {
    throw new TypeError(`Transformer for ${pattern} must name a module`);
  }
  const rootRequire = createRequire(resolve(config.rootDir, 'package.json'));
  let modulePath = moduleName;
  if (!isAbsolute(moduleName)) {
    try {
      modulePath = rootRequire.resolve(moduleName);
    } catch (error) {
      modulePath = runtimeToolPaths?.[moduleName];
      if (!modulePath) throw error;
    }
  }
  const loaded = await loadModule(modulePath, config.rootDir);
  const exported = loaded?.default ?? loaded;
  const transformer =
    typeof exported?.createTransformer === 'function'
      ? await exported.createTransformer(transformerConfig ?? {})
      : exported;
  if (
    !transformer ||
    (typeof transformer.process !== 'function' &&
      typeof transformer.processAsync !== 'function')
  ) {
    throw new TypeError(
      `Transformer ${moduleName} does not expose process() or processAsync()`,
    );
  }
  return {
    moduleName,
    pattern: new RegExp(pattern),
    transformer,
    transformerConfig: transformerConfig ?? {},
  };
}

function transformOptions(selected, config) {
  const options = {
    cacheFS: new Map(),
    config,
    configString: JSON.stringify(config),
    instrument: false,
    rootDir: config.rootDir,
    supportsDynamicImport: true,
    supportsExportNamespaceFrom: false,
    supportsStaticESM: false,
    supportsTopLevelAwait: false,
    transformerConfig: selected.transformerConfig,
  };
  return options;
}

function callTransformer(transformer, process, source, filename, config, options) {
  return process.length >= 4
    ? process.call(transformer, source, filename, config, options)
    : process.call(transformer, source, filename, options);
}

async function transformSource(selected, source, filename, config) {
  const process = selected.transformer.processAsync ?? selected.transformer.process;
  const transformed = await callTransformer(
    selected.transformer,
    process,
    source,
    filename,
    config,
    transformOptions(selected, config),
  );
  return transformedCode(transformed, filename);
}

function transformSourceSync(selected, source, filename, config) {
  if (typeof selected.transformer.process !== 'function') {
    throw new TypeError(
      `Transformer ${selected.moduleName} cannot synchronously transform ${filename}`,
    );
  }
  const transformed = callTransformer(
    selected.transformer,
    selected.transformer.process,
    source,
    filename,
    config,
    transformOptions(selected, config),
  );
  if (transformed && typeof transformed.then === 'function') {
    throw new TypeError(
      `Transformer ${selected.moduleName} returned a promise while loading ${filename} synchronously`,
    );
  }
  return transformedCode(transformed, filename);
}

function transformedCode(transformed, filename) {
  const code = typeof transformed === 'string' ? transformed : transformed?.code;
  if (typeof code !== 'string') {
    throw new TypeError(`Transformer returned no code for ${filename}`);
  }
  return code;
}

function environmentDelta() {
  const delta = {};
  const keys = new Set([
    ...Object.keys(initialEnvironment),
    ...Object.keys(process.env),
  ]);
  for (const key of keys) {
    const before = initialEnvironment[key];
    const after = process.env[key];
    if (before !== after) delta[key] = after ?? null;
  }
  return delta;
}

function globalHookError(moduleName, modulePath, error) {
  const reason = error instanceof Error ? error.message : String(error);
  const wrapped = new Error(
    `Jest: Got error running ${moduleName} - ${modulePath}, reason: ${reason}`,
  );
  wrapped.cause = error;
  return wrapped;
}

function respond(value) {
  process.stdout.write(`${PREFIX}${JSON.stringify(value)}\n`);
}

function formatError(error) {
  if (error instanceof Error) return error.stack || error.message;
  return String(error);
}
