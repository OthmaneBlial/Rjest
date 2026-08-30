import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {extname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const PREFIX = '__RJEST_CONFIG__';
const request = JSON.parse(readFileSync(0, 'utf8'));

try {
  const loaded = await loadConfigModule(request.path);
  let config = loaded.default ?? loaded;
  if (typeof config === 'function') config = await config();
  if (config && typeof config.then === 'function') config = await config;
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw new TypeError('Jest configuration must export an object or a function returning an object');
  }
  assertJsonCompatible(config, 'config', new Set());
  respond({ok: true, config});
} catch (error) {
  respond({
    ok: false,
    error: error instanceof Error ? error.stack || error.message : String(error),
  });
}

async function loadConfigModule(path) {
  const extension = extname(path);
  if (!['.ts', '.cts', '.mts'].includes(extension)) {
    return import(`${pathToFileURL(path).href}?rjest=${Date.now()}`);
  }
  if (process.features.typescript) {
    try {
      return await import(`${pathToFileURL(path).href}?rjest=${Date.now()}`);
    } catch (error) {
      if (extension === '.mts' || !(error instanceof SyntaxError)) throw error;
    }
  }
  if (extension === '.mts') {
    throw new Error(
      `TypeScript Jest config ${path} requires native TypeScript support`,
    );
  }
  const require = createRequire(path);
  let compiler;
  try {
    let tsNode;
    try {
      tsNode = require('ts-node');
    } catch (error) {
      if (error?.code !== 'MODULE_NOT_FOUND') throw error;
      tsNode = createRequire(resolve(process.cwd(), 'package.json'))('ts-node');
    }
    compiler = tsNode.register({
      compilerOptions: {module: 'CommonJS'},
      moduleTypes: {'**': 'cjs'},
    });
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        `TypeScript Jest config ${path} requires ts-node to be installed`,
        {cause: error},
      );
    }
    throw error;
  }
  compiler.enabled(true);
  try {
    return require(path);
  } finally {
    compiler.enabled(false);
  }
}

function respond(payload) {
  process.stdout.write(`${PREFIX}${JSON.stringify(payload)}\n`, () => {
    process.exit(0);
  });
}

function assertJsonCompatible(value, path, seen) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return;
  if (typeof value !== 'object') {
    throw new TypeError(`Unsupported ${typeof value} at ${path}; configuration must be serializable`);
  }
  if (seen.has(value)) throw new TypeError(`Circular configuration value at ${path}`);
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === 'symbol') {
      throw new TypeError(`Unsupported symbol key at ${path}`);
    }
    assertJsonCompatible(value[key], `${path}.${key}`, seen);
  }
  seen.delete(value);
}
