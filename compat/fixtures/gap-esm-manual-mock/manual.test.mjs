import {expect, jest, test} from '@jest/globals';
import * as dependency from './dependency.mjs';

test('a sibling ESM manual mock wins over generated metadata', () => {
  expect(dependency.kind).toBe('manual mock');
  expect(dependency.read()).toBe('manual implementation');
  expect(jest.isMockFunction(dependency.read)).toBe(false);
});
