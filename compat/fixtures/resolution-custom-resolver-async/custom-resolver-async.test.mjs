import {expect, test} from '@jest/globals';
import {loaded} from 'async-only-target';
import {condition} from '@rjest-fixture/math';

test('awaits an async-only resolver for static ESM imports', () => {
  expect(loaded).toBe('through-async-only-resolver');
  expect(condition).toBe('import');
});

test('awaits an async-only resolver for dynamic ESM imports', async () => {
  expect((await import('async-only-target')).loaded).toBe(
    'through-async-only-resolver',
  );
});
