import {expect, jest, test} from '@jest/globals';
import * as dependency from './dependency.mjs';
import * as packageManual from '@rjest-fixture/math';
import * as ghost from 'ghost-pkg';

test('a sibling ESM manual mock wins over generated metadata', () => {
  expect(dependency.kind).toBe('manual mock');
  expect(dependency.read()).toBe('manual implementation');
  expect(dependency.readHelper()).toBeUndefined();
  expect(jest.isMockFunction(dependency.read)).toBe(false);
  expect(jest.isMockFunction(dependency.nestedHelper)).toBe(true);
});

test('a manual mock dependency is generated in a scratch registry', async () => {
  const outside = await import('./__mocks__/manual-helper.mjs');

  expect(jest.isMockFunction(outside.helper)).toBe(true);
  expect(outside.helper).not.toBe(dependency.nestedHelper);
});

test('a root ESM manual mock can satisfy an unresolvable bare name', () => {
  expect(ghost.kind).toBe('root manual mock');
  expect(ghost.marker).toEqual({source: 'root'});
});

test('a root manual mock wins over a resolved sibling package mock', () => {
  expect(packageManual.kind).toBe('root package manual mock');
});

test('a sibling manual mock serves dynamic import', async () => {
  const dynamic = await import('./dynamic-dependency.mjs');

  expect(dynamic.kind).toBe('dynamic manual mock');
  expect(dynamic.read()).toBe('dynamic manual implementation');
  expect(jest.isMockFunction(dynamic.read)).toBe(false);
});

test('unstable_unmockModule bypasses a sibling manual mock', async () => {
  jest.unstable_unmockModule('./unmock-target.mjs');
  const actual = await import('./unmock-target.mjs');

  expect(actual.kind).toBe('actual unmock target');
  expect(actual.read()).toBe('actual unmock implementation');
});

test('resetModules reloads a manual mock in a fresh ESM registry', async () => {
  const before = await import('./reset-target.mjs');
  expect((await import('./reset-target.mjs')).marker).toBe(before.marker);

  jest.resetModules();
  const after = await import('./reset-target.mjs');

  expect(after.marker).not.toBe(before.marker);
  expect(after.evaluation).toBeGreaterThan(before.evaluation);
});

test('a first-use isolated manual mock does not leak outside', async () => {
  let isolated;
  await jest.isolateModulesAsync(async () => {
    isolated = await import('./isolation-target.mjs');
    expect((await import('./isolation-target.mjs')).marker).toBe(
      isolated.marker,
    );
  });

  const outside = await import('./isolation-target.mjs');
  expect(outside.marker).not.toBe(isolated.marker);
  expect(outside.evaluation).toBeGreaterThan(isolated.evaluation);
  expect((await import('./isolation-target.mjs')).marker).toBe(outside.marker);
});
