import {afterEach, expect, jest, test} from '@jest/globals';

jest.unstable_mockModule('./dependency.js', async () => ({
  answer: jest.fn(() => 42),
}));

const consumer = await import('./consumer.js');

afterEach(() => {
  jest.clearAllMocks();
});

test('transforms an extension configured as ESM', () => {
  expect(consumer.transformedAnswer()).toBe(42);
  expect(consumer.transformedAnswer).toHaveBeenCalledTimes(1);
});
