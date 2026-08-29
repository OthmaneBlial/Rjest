import {expect, jest, test} from '@jest/globals';

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
});

test('isolates ESM mock instances and cleans up after errors', async () => {
  let invocations = 0;
  const factory = jest.fn(() => ({invocation: ++invocations}));
  jest.unstable_mockModule('./mock-target.mjs', factory);

  let isolated;
  await jest.isolateModulesAsync(async () => {
    isolated = await import('./mock-target.mjs');
  });
  const outside = await import('./mock-target.mjs');

  expect(isolated.invocation).toBe(1);
  expect(outside.invocation).toBe(2);
  expect(factory).toHaveBeenCalledTimes(2);

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
});
