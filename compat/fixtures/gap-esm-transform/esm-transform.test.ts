import {afterEach, expect, jest, test} from '@jest/globals';

jest.unstable_mockModule('./dependency.js', () => ({
  answer: jest.fn(() => 42),
}));

const dependency = await import('./dependency.js');

afterEach(() => {
  jest.clearAllMocks();
});

test('transforms an extension configured as ESM', () => {
  expect(dependency.answer()).toBe(42);
  expect(dependency.answer).toHaveBeenCalledTimes(1);
});
