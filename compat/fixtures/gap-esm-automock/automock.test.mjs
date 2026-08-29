import {expect, jest, test} from '@jest/globals';

const dependency = await import('./dependency.mjs');

test('automocks native ESM exports', () => {
  expect(jest.isMockFunction(dependency.add)).toBe(true);
  expect(dependency.add(2, 3)).toBeUndefined();
  expect(jest.isMockFunction(dependency.nested.method)).toBe(true);
  expect(dependency.nested.method()).toBeUndefined();
});
