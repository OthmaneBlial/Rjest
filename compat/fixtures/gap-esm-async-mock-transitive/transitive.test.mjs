import {expect, jest, test} from '@jest/globals';

const factory = jest.fn(async () => {
  await Promise.resolve();
  return {value: 'mocked transitive dependency'};
});
jest.unstable_mockModule('./dependency.mjs', factory);

const consumer = await import('./consumer.mjs');

test('awaits an async factory reached through a static ESM import', () => {
  expect(consumer.consumed).toBe('mocked transitive dependency');
  expect(factory).toHaveBeenCalledTimes(1);
});
