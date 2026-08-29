import {expect, test} from '@jest/globals';
import {source} from 'esm-shared';
import {condition} from '@rjest-fixture/math';

test('uses moduleDirectories for static native ESM imports', () => {
  expect(source).toBe('absolute-esm');
  expect(condition).toBe('import');
});

test('uses moduleDirectories for dynamic native ESM imports', async () => {
  expect((await import('esm-shared')).source).toBe('absolute-esm');
});
