import {expect, jest, test} from '@jest/globals';
import * as staticDependency from './static-dependency.mjs';

const dependency = await import('./dependency.mjs');

test('automocks native ESM export metadata', () => {
  expect(jest.isMockFunction(dependency.add)).toBe(true);
  expect(dependency.add(2, 3)).toBeUndefined();
  expect(jest.isMockFunction(dependency.default)).toBe(true);
  expect(dependency.default(5, 2)).toBeUndefined();
  expect(jest.isMockFunction(dependency.Calculator)).toBe(true);
  const calculator = new dependency.Calculator();
  expect(jest.isMockFunction(calculator.multiply)).toBe(true);
  expect(calculator.multiply(2, 4)).toBeUndefined();
  expect(dependency.list).toEqual([]);
  expect(dependency.label).toBe('actual label');
  expect(jest.isMockFunction(dependency.nested.method)).toBe(true);
  expect(dependency.nested.method()).toBeUndefined();
});

test('automocks static imports and package exports', async () => {
  expect(jest.isMockFunction(staticDependency.read)).toBe(true);
  expect(staticDependency.read()).toBeUndefined();

  const packageDependency = await import('@rjest-fixture/math');
  expect(jest.isMockFunction(packageDependency.sum)).toBe(true);
  expect(packageDependency.sum(2, 5)).toBeUndefined();
});

test('unstable_unmockModule restores an actual ESM module', async () => {
  globalThis.__rjestEsmAutomockActualEvaluations = 0;
  expect(jest.unstable_unmockModule('./actual-target.mjs')).toBe(jest);
  const actual = await import('./actual-target.mjs');

  expect(jest.isMockFunction(actual.read)).toBe(false);
  expect(actual.read()).toBe('actual dependency');
  expect(actual.evaluation).toBe(1);
});

test('disableAutomock bypasses generation for later imports', async () => {
  expect(jest.disableAutomock()).toBe(jest);
  const actual = await import('./disabled-target.mjs');
  expect(actual.read()).toBe('automocking disabled');
  expect(jest.isMockFunction(actual.read)).toBe(false);
  expect(jest.enableAutomock()).toBe(jest);
});

test('resetModules creates a fresh generated mock instance', async () => {
  const first = await import('./reset-target.mjs');
  first.read.mockReturnValue('first instance');
  expect(first.read()).toBe('first instance');

  jest.resetModules();
  const second = await import('./reset-target.mjs');
  expect(second).not.toBe(first);
  expect(second.read).not.toBe(first.read);
  expect(second.read()).toBeUndefined();
});

test('isolateModulesAsync does not leak a first-use generated mock', async () => {
  let isolated;
  await jest.isolateModulesAsync(async () => {
    isolated = await import('./isolation-target.mjs');
    isolated.read.mockReturnValue('isolated instance');
  });
  const outside = await import('./isolation-target.mjs');

  expect(isolated.read()).toBe('isolated instance');
  expect(outside).not.toBe(isolated);
  expect(outside.read).not.toBe(isolated.read);
  expect(outside.read()).toBeUndefined();
});

test('an explicit ESM factory takes precedence over automocking', async () => {
  jest.unstable_mockModule('./explicit-target.mjs', () => ({
    read: () => 'explicit factory',
  }));
  const explicit = await import('./explicit-target.mjs');

  expect(jest.isMockFunction(explicit.read)).toBe(false);
  expect(explicit.read()).toBe('explicit factory');
});
