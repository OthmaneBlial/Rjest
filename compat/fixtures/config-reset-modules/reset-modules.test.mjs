import {expect, test} from '@jest/globals';

let previous;

test('resetModules config supplies a native ESM instance', async () => {
  previous = await import('./stateful.mjs');
  expect((await import('./stateful.mjs')).marker).toBe(previous.marker);
});

test('resetModules config refreshes native ESM before the next test', async () => {
  const current = await import('./stateful.mjs');

  expect(current.marker).not.toBe(previous.marker);
  expect(current.evaluation).toBeGreaterThan(previous.evaluation);
});
