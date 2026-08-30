import {readFileSync} from 'node:fs';
import Module, {createRequire, isBuiltin} from 'node:module';
import {delimiter, dirname, isAbsolute, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const PREFIX = '__RJEST_DEPENDENCIES__';
const request = JSON.parse(readFileSync(0, 'utf8'));

try {
  const ResolverFactory = loadResolverFactory(request.resolverEnginePath);
  const customResolver = await loadCustomResolver(request.resolver, request.rootDir);
  const dependencies = request.files.map(file => ({
    file,
    dependencies: [...extractDependencies(readFileSync(file, 'utf8'))]
      .map(specifier =>
        resolveDependency(specifier, file, customResolver.resolver, ResolverFactory),
      )
      .filter(Boolean),
  }));
  respond({
    ok: true,
    conservativeFallback: customResolver.conservativeFallback,
    dependencies,
  });
} catch (error) {
  respond({ok: false, error: formatError(error)});
}

function extractDependencies(source) {
  const dependencies = new Set();
  const add = (_match, _quote, dependency) => {
    dependencies.add(dependency);
    return _match;
  };
  const withoutComments = source.replaceAll(/\/\*[^]*?\*\//g, '').replaceAll(/\/\/.*/g, '');
  withoutComments
    .replace(
      /\b(?:import|export)\s+(?!type(?:of)?\s+)(?:[^'"]+\s+from\s+)?([`'"])([^'"`]*?)(?:\1)/g,
      add,
    )
    .replace(/(?<!\.\s*)\b(?:require|import)\s*\(\s*([`'"])([^'"`]*?)(?:\1)\s*(?:,\s*)?\)/g, add)
    .replace(
      /(?<!\.\s*)\bjest\s*\.\s*(?:requireActual|requireMock|createMockFromModule)\s*\(\s*([`'"])([^'"`]*?)(?:\1)\s*(?:,\s*)?\)/g,
      add,
    );
  return dependencies;
}

function loadResolverFactory(modulePath) {
  const rootRequire = createRequire(resolve(request.rootDir, 'package.json'));
  const loaded = rootRequire(modulePath);
  if (typeof loaded?.ResolverFactory !== 'function') {
    throw new TypeError(`Resolver engine ${modulePath} exports no ResolverFactory`);
  }
  return loaded.ResolverFactory;
}

async function loadCustomResolver(specifier, rootDir) {
  if (!specifier) return {resolver: undefined, conservativeFallback: false};
  const rootRequire = createRequire(resolve(rootDir, 'package.json'));
  const modulePath = isAbsolute(specifier) ? specifier : rootRequire.resolve(specifier);
  let loaded;
  try {
    loaded = rootRequire(modulePath);
  } catch (error) {
    if (error?.code !== 'ERR_REQUIRE_ESM' && error?.code !== 'ERR_REQUIRE_ASYNC_MODULE') {
      throw error;
    }
    loaded = await import(pathToFileURL(modulePath).href);
  }
  const exported = loaded?.default ?? loaded;
  if (typeof exported === 'function') {
    return {resolver: exported, conservativeFallback: false};
  }
  if (typeof exported?.sync === 'function') {
    return {resolver: exported.sync, conservativeFallback: false};
  }
  if (typeof loaded?.sync === 'function') {
    return {resolver: loaded.sync, conservativeFallback: false};
  }
  return {
    resolver: undefined,
    conservativeFallback:
      typeof exported?.async === 'function' || typeof loaded?.async === 'function',
  };
}

function moduleExtensions() {
  const configured = request.moduleFileExtensions.map(extension =>
    extension.startsWith('.') ? extension : `.${extension}`,
  );
  const extensions = [...configured];
  if (request.haste?.platforms?.includes('native')) {
    extensions.unshift(...configured.map(extension => `.native${extension}`));
  }
  if (request.haste?.defaultPlatform) {
    extensions.unshift(
      ...configured.map(extension => `.${request.haste.defaultPlatform}${extension}`),
    );
  }
  return extensions;
}

function resolverOptions(file, ResolverFactory) {
  const extensions = moduleExtensions();
  const defaultResolver = (specifier, options = {}) =>
    resolveDefault(specifier, file, ResolverFactory, {
      ...resolverOptionsValue,
      ...options,
    });
  const resolverOptionsValue = {
    basedir: dirname(file),
    conditions: undefined,
    defaultAsyncResolver: async (specifier, options) => defaultResolver(specifier, options),
    defaultResolver,
    extensions,
    moduleDirectory: request.moduleDirectories,
    paths: request.modulePaths?.length
      ? request.modulePaths
      : process.env.NODE_PATH?.split(delimiter).filter(Boolean),
    rootDir: request.rootDir,
  };
  return resolverOptionsValue;
}

function resolveDefault(specifier, file, ResolverFactory, options) {
  if (isBuiltin(specifier) || Module.isBuiltin(specifier)) return specifier;
  const resolveWithModules = modules => {
    const resolver = new ResolverFactory({
      conditionNames: options.conditions ?? ['require', 'node', 'default'],
      extensions: options.extensions ?? moduleExtensions(),
      modules,
      roots: options.rootDir ? [options.rootDir] : [request.rootDir],
    });
    return resolver.sync(options.basedir ?? dirname(file), specifier);
  };
  let result = resolveWithModules(options.moduleDirectory ?? request.moduleDirectories);
  if (!result.path && options.paths?.length) {
    result = resolveWithModules(options.paths);
  }
  if (result.path) return result.path;
  return createRequire(file).resolve(specifier);
}

function mappedCandidates(specifier) {
  for (const mapping of request.moduleNameMapper ?? []) {
    const expression = new RegExp(mapping.pattern);
    const matches = expression.exec(specifier);
    if (!matches) continue;
    return mapping.replacements.map(replacement =>
      replacement.replaceAll(/\$(\d+)/g, (_match, index) => matches[Number(index)] ?? ''),
    );
  }
  return [specifier];
}

function resolveDependency(specifier, file, customResolver, ResolverFactory) {
  if (isBuiltin(specifier) || Module.isBuiltin(specifier)) return undefined;
  const options = resolverOptions(file, ResolverFactory);
  for (const candidate of mappedCandidates(specifier)) {
    try {
      const resolved = customResolver
        ? customResolver(candidate, options)
        : resolveDefault(candidate, file, ResolverFactory, options);
      if (resolved && typeof resolved.then === 'function') continue;
      if (resolved && !isBuiltin(resolved) && !Module.isBuiltin(resolved)) return resolved;
    } catch {
      // Jest's inverse resolver skips dependencies it cannot resolve.
    }
  }
  return undefined;
}

function respond(value) {
  process.stdout.write(`${PREFIX}${JSON.stringify(value)}\n`);
}

function formatError(error) {
  return error?.stack || error?.message || String(error);
}
