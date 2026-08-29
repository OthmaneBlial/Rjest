import {expect, jest, test} from '@jest/globals';

const relativeFactory = jest.fn(async () => {
  await Promise.resolve();
  return {
    'hyphen-name': 'mocked non-identifier export',
    answer: jest.fn(() => 42),
    class: 'mocked reserved export',
    default: 'mocked relative default',
  };
});
jest.unstable_mockModule('./relative.mjs', relativeFactory);

const packageFactory = jest.fn(async () => {
  await Promise.resolve();
  return {multiply: jest.fn(() => 42)};
});
jest.unstable_mockModule('@rjest-fixture/math', packageFactory);

const builtinFactory = jest.fn(async () => {
  await Promise.resolve();
  return {basename: jest.fn(() => 'mocked-basename')};
});
jest.unstable_mockModule('node:path', builtinFactory);

const rejectionFactory = jest.fn(async () => {
  await Promise.resolve();
  throw new Error('async ESM factory failed');
});
jest.unstable_mockModule('./reject.mjs', rejectionFactory);

let concurrentCalls = 0;
const concurrentFactory = jest.fn(async () => {
  const call = ++concurrentCalls;
  await Promise.resolve();
  return {call};
});
jest.unstable_mockModule('./concurrent.mjs', concurrentFactory);

test('awaits and caches an async relative factory', async () => {
  const first = await import('./relative.mjs');
  const second = await import('./relative.mjs');

  expect(first.default).toBe('mocked relative default');
  expect(first.answer()).toBe(42);
  expect(first.class).toBe('mocked reserved export');
  expect(first['hyphen-name']).toBe('mocked non-identifier export');
  expect(second.default).toBe('mocked relative default');
  expect(second.answer()).toBe(42);
  expect(relativeFactory).toHaveBeenCalledTimes(1);
});

test('awaits async package and built-in factories', async () => {
  const [math, path] = await Promise.all([
    import('@rjest-fixture/math'),
    import('node:path'),
  ]);

  expect(math.multiply(6, 7)).toBe(42);
  expect(path.basename('/actual/value.txt')).toBe('mocked-basename');
  expect(packageFactory).toHaveBeenCalledTimes(1);
  expect(builtinFactory).toHaveBeenCalledTimes(1);
});

test('propagates and does not cache a rejected async factory', async () => {
  await expect(import('./reject.mjs')).rejects.toThrow('async ESM factory failed');
  await expect(import('./reject.mjs')).rejects.toThrow('async ESM factory failed');
  expect(rejectionFactory).toHaveBeenCalledTimes(2);
});

test('matches Jest factory races for concurrent first imports', async () => {
  const modules = await Promise.all([
    import('./concurrent.mjs'),
    import('./concurrent.mjs'),
  ]);

  expect(modules.map(module => module.call)).toEqual([1, 2]);
  expect(concurrentFactory).toHaveBeenCalledTimes(2);
  expect((await import('./concurrent.mjs')).call).toBe(2);
});

test('preserves ordinary dynamic imports and their parent module semantics', async () => {
  const relative = await import /* comment between import and call */ ('./actual.mjs');
  const packageSubpath = await import('@rjest-fixture/math/actual');
  const json = await import('./payload.json', {with: {type: 'json'}});
  const interpolated = `${(await import('./actual.mjs')).value}`;

  expect(relative.value).toBe('actual dynamic relative');
  expect(packageSubpath.condition).toBe('import');
  expect(json.default).toEqual({value: 42});
  expect(interpolated).toBe('actual dynamic relative');
});

test('does not rewrite import-like text in JavaScript literals', () => {
  const text = 'import("./not-a-module.mjs")';
  const template = `import('./also-not-a-module.mjs')`;
  const expression = /import[(]/;

  expect(text).toContain('not-a-module');
  expect(template).toContain('also-not-a-module');
  expect(expression.test('import(')).toBe(true);
});
