import {basename} from 'node:path';
import {expect, jest, test} from '@jest/globals';

const calls = [];
jest.onGenerateMock((modulePath, mock) => {
  calls.push(`first:${basename(modulePath)}`);
  mock.read.mockReturnValue('configured ESM mock');
  mock.callbackOrder = 'first';
  return mock;
});
jest.onGenerateMock((modulePath, mock) => {
  calls.push(`second:${basename(modulePath)}`);
  return {...mock, callbackOrder: `${mock.callbackOrder}:second`};
});
jest.unstable_mockModule('./esm-explicit.mjs', () => ({
  tag: 'explicit ESM factory',
}));

test('onGenerateMock transforms native ESM automocks in registration order', async () => {
  const service = await import('./esm-service.mjs');

  expect(service.read()).toBe('configured ESM mock');
  expect(service.callbackOrder).toBe('first:second');
  expect(calls).toEqual(['first:esm-service.mjs', 'second:esm-service.mjs']);
  expect((await import('./esm-service.mjs')).read).toBe(service.read);
});

test('native ESM manual mocks skip callbacks and reset regenerates automocks', async () => {
  expect((await import('./esm-manual.mjs')).tag).toBe(
    'authored ESM manual mock',
  );
  expect(calls).toHaveLength(2);
  expect((await import('./esm-explicit.mjs')).tag).toBe(
    'explicit ESM factory',
  );
  expect(calls).toHaveLength(2);

  const before = await import('./esm-service.mjs');
  jest.resetModules();
  const after = await import('./esm-service.mjs');

  expect(after.read).not.toBe(before.read);
  expect(after.callbackOrder).toBe('first:second');
  expect(calls).toEqual([
    'first:esm-service.mjs',
    'second:esm-service.mjs',
    'first:esm-service.mjs',
    'second:esm-service.mjs',
  ]);
});
