import {createRequire} from 'node:module';
import {expect, jest, test} from '@jest/globals';

const require = createRequire(import.meta.url);

test('isolateModulesAsync restores the outer ESM registry', async () => {
  const outer = await import('./stateful.mjs');
  outer.increment();
  outer.increment();

  let isolated;
  const result = await jest.isolateModulesAsync(async () => {
    isolated = await import('./stateful.mjs');
    expect(isolated).not.toBe(outer);
    expect(isolated.getCount()).toBe(0);
    isolated.increment();
  });

  expect(result).toBeUndefined();
  expect(isolated.getCount()).toBe(1);
  expect((await import('./stateful.mjs')).getCount()).toBe(2);
  expect(await import('./stateful.mjs')).toBe(outer);

  let secondIsolation;
  await jest.isolateModulesAsync(async () => {
    secondIsolation = await import('./stateful.mjs');
  });
  expect(secondIsolation).not.toBe(isolated);
  expect(secondIsolation.getCount()).toBe(0);
  expect((await import('./stateful.mjs')).getCount()).toBe(2);
});

test('isolates ESM mock instances and cleans up after errors', async () => {
  let invocations = 0;
  const factory = jest.fn(() => ({invocation: ++invocations}));
  jest.unstable_mockModule('./mock-target.mjs', factory);

  let isolated;
  await jest.isolateModulesAsync(async () => {
    isolated = await import('./mock-target.mjs');
  });
  let secondIsolation;
  await jest.isolateModulesAsync(async () => {
    secondIsolation = await import('./mock-target.mjs');
  });
  const outside = await import('./mock-target.mjs');

  expect(isolated.invocation).toBe(1);
  expect(secondIsolation.invocation).toBe(2);
  expect(secondIsolation).not.toBe(isolated);
  expect(outside.invocation).toBe(3);
  expect(factory).toHaveBeenCalledTimes(3);

  await expect(
    jest.isolateModulesAsync(async () => {
      throw new Error('isolated callback failed');
    }),
  ).rejects.toThrow('isolated callback failed');

  await expect(
    jest.isolateModulesAsync(async () => {
      await jest.isolateModulesAsync(async () => {});
    }),
  ).rejects.toThrow(
    'isolateModulesAsync cannot be nested inside another isolateModulesAsync or isolateModules.',
  );

  await expect(
    jest.isolateModulesAsync(async () => {
      jest.isolateModules(() => {});
    }),
  ).rejects.toThrow(
    'isolateModules cannot be nested inside another isolateModules or isolateModulesAsync.',
  );
});

test('keeps a fresh CommonJS registry active across awaits', async () => {
  globalThis.__rjestIsolatedCjsEvaluations = 0;
  const outside = require('./stateful.cjs');

  let isolated;
  await jest.isolateModulesAsync(async () => {
    await Promise.resolve();
    isolated = require('./stateful.cjs');
    expect(require('./stateful.cjs')).toBe(isolated);
  });

  expect(outside.evaluation).toBe(1);
  expect(isolated.evaluation).toBe(2);
  expect(isolated).not.toBe(outside);
  expect(require('./stateful.cjs')).toBe(outside);
});

test('does not leak a CommonJS mock first instantiated inside', async () => {
  let invocations = 0;
  const factory = jest.fn(() => ({invocation: ++invocations}));
  jest.mock('./cjs-target.cjs', factory);

  let isolated;
  await jest.isolateModulesAsync(async () => {
    await Promise.resolve();
    isolated = require('./cjs-target.cjs');
  });
  const outside = require('./cjs-target.cjs');

  expect(isolated.invocation).toBe(1);
  expect(outside.invocation).toBe(2);
  expect(factory).toHaveBeenCalledTimes(2);
});

test('inherits mock instances that already exist in the outer registry', async () => {
  const esmFactory = jest.fn(() => ({value: 'outer ESM mock'}));
  jest.unstable_mockModule('./preloaded-mock-target.mjs', esmFactory);
  const outerEsm = await import('./preloaded-mock-target.mjs');

  const cjsFactory = jest.fn(() => ({value: 'outer CommonJS mock'}));
  jest.mock('./preloaded-cjs-target.cjs', cjsFactory);
  const outerCjs = require('./preloaded-cjs-target.cjs');

  await jest.isolateModulesAsync(async () => {
    expect(await import('./preloaded-mock-target.mjs')).toBe(outerEsm);
    expect(require('./preloaded-cjs-target.cjs')).toBe(outerCjs);
  });

  expect(esmFactory).toHaveBeenCalledTimes(1);
  expect(cjsFactory).toHaveBeenCalledTimes(1);
});

test('keeps an outer mock instance when its factory changes inside isolation', async () => {
  const outerFactory = jest.fn(() => ({value: 'outer instance'}));
  const replacementFactory = jest.fn(() => ({value: 'replacement instance'}));
  jest.unstable_mockModule('./replaced-mock-target.mjs', outerFactory);
  const outer = await import('./replaced-mock-target.mjs');

  let isolated;
  await jest.isolateModulesAsync(async () => {
    jest.unstable_mockModule('./replaced-mock-target.mjs', replacementFactory);
    isolated = await import('./replaced-mock-target.mjs');
  });

  expect(isolated).toBe(outer);
  expect(await import('./replaced-mock-target.mjs')).toBe(outer);
  expect(outerFactory).toHaveBeenCalledTimes(1);
  expect(replacementFactory).not.toHaveBeenCalled();

  jest.resetModules();
  const afterReset = await import('./replaced-mock-target.mjs');
  expect(afterReset.value).toBe('replacement instance');
  expect(replacementFactory).toHaveBeenCalledTimes(1);
});

test('resetModules exits isolation and clears the outer registries', async () => {
  globalThis.__rjestResetInsideIsolationEsm = 0;
  globalThis.__rjestResetInsideIsolationCjs = 0;
  const outerEsm = await import('./reset-inside-isolation.mjs');
  const outerCjs = require('./reset-inside-isolation.cjs');

  let isolatedEsm;
  let isolatedCjs;
  let afterResetEsm;
  let afterResetCjs;
  await jest.isolateModulesAsync(async () => {
    isolatedEsm = await import('./reset-inside-isolation.mjs');
    isolatedCjs = require('./reset-inside-isolation.cjs');
    jest.resetModules();
    afterResetEsm = await import('./reset-inside-isolation.mjs');
    afterResetCjs = require('./reset-inside-isolation.cjs');
  });

  expect(outerEsm.evaluation).toBe(1);
  expect(isolatedEsm.evaluation).toBe(2);
  expect(afterResetEsm.evaluation).toBe(3);
  expect(await import('./reset-inside-isolation.mjs')).toBe(afterResetEsm);
  expect(outerCjs.evaluation).toBe(1);
  expect(isolatedCjs.evaluation).toBe(2);
  expect(afterResetCjs.evaluation).toBe(3);
  expect(require('./reset-inside-isolation.cjs')).toBe(afterResetCjs);
});
