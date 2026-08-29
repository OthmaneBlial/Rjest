import {expect, jest, test} from '@jest/globals';

jest.unstable_mockModule('./dependency.mjs', () => ({
  value: 'mocked ESM dependency',
}));
jest.unstable_mockModule('@rjest-fixture/math', () => ({
  value: 'mocked package dependency',
}));
jest.unstable_mockModule('node:path', () => ({
  basename: () => 'mocked-basename',
}));

const lazyFactory = jest.fn(async () => ({value: 'unused mock'}));
jest.unstable_mockModule('./lazy.mjs', lazyFactory);

const mocked = await import('./dependency.mjs');
const unmockResult = jest.unstable_unmockModule('./dependency.mjs');
const actual = await import('./dependency.mjs');
const mockedPackage = await import('@rjest-fixture/math');
jest.unstable_unmockModule('@rjest-fixture/math');
const actualPackage = await import('@rjest-fixture/math');
const mockedPath = await import('node:path');
jest.unstable_unmockModule('node:path');
const actualPath = await import('node:path');
jest.unstable_unmockModule('./lazy.mjs');
const lazyActual = await import('./lazy.mjs');

jest.unstable_mockModule('./dependency.mjs', () => ({
  value: 're-mocked ESM dependency',
}));
const remocked = await import('./dependency.mjs');

test('unstable_unmockModule restores the actual ESM module', () => {
  expect(mocked.value).toBe('mocked ESM dependency');
  expect(unmockResult).toBe(jest);
  expect(actual.value).toBe('actual ESM dependency');
  expect(mockedPackage.value).toBe('mocked package dependency');
  expect(actualPackage.value).toBe('actual package dependency');
  expect(mockedPath.basename('/real/value.txt')).toBe('mocked-basename');
  expect(actualPath.basename('/real/value.txt')).toBe('value.txt');
  expect(lazyActual.value).toBe('actual lazy ESM dependency');
  expect(lazyFactory).not.toHaveBeenCalled();
  expect(remocked.value).toBe('mocked ESM dependency');
});
