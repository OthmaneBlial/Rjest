import {expect, test} from '@jest/globals';
import {injected} from './injected.mjs';
import {nested} from './nested.mjs';
import {value} from './value.mjs';

test('awaits processAsync across a transformed static graph', () => {
  expect(value).toBe(73);
  expect(nested).toBe(73);
  expect(injected).toBe(73);
});

test('prepares a dynamically imported transformed graph', async () => {
  const dynamic = await import('./dynamic.mjs');
  expect(dynamic.value).toBe(73);
});
