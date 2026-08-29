import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const PREFIX = '__RJEST_CONFIG__';
const request = JSON.parse(readFileSync(0, 'utf8'));

try {
  const loaded = await import(`${pathToFileURL(request.path).href}?rjest=${Date.now()}`);
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
