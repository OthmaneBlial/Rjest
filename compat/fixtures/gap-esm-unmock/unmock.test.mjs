import {expect, jest, test} from '@jest/globals';

jest.unstable_mockModule('./dependency.mjs', () => ({
  value: 'mocked ESM dependency',
}));

const mocked = await import('./dependency.mjs');
const unmockResult = jest.unstable_unmockModule('./dependency.mjs');
const actual = await import('./dependency.mjs');

test('unstable_unmockModule restores the actual ESM module', () => {
  expect(mocked.value).toBe('mocked ESM dependency');
  expect(unmockResult).toBe(jest);
  expect(actual.value).toBe('actual ESM dependency');
});
