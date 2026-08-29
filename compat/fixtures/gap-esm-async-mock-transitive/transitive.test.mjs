import {expect, jest, test} from '@jest/globals';

const events = [];
const factory = jest.fn(async () => {
  events.push('first:start');
  await Promise.resolve();
  events.push('first:end');
  return {value: 'mocked transitive dependency'};
});
jest.unstable_mockModule('./dependency.mjs', factory);

const secondFactory = jest.fn(async () => {
  events.push('second:start');
  await Promise.resolve();
  events.push('second:end');
  return {second: 'mocked second dependency'};
});
jest.unstable_mockModule('./second.mjs', secondFactory);

const packageFactory = jest.fn(async () => {
  events.push('package:start');
  await Promise.resolve();
  events.push('package:end');
  return {multiply: () => 42};
});
jest.unstable_mockModule('@rjest-fixture/math', packageFactory);

const builtinFactory = jest.fn(async () => {
  events.push('builtin:start');
  await Promise.resolve();
  events.push('builtin:end');
  return {platform: () => 'mocked-platform'};
});
jest.unstable_mockModule('node:os', builtinFactory);

const unusedFactory = jest.fn(async () => {
  events.push('unused');
  return {unused: 'mocked unused dependency'};
});
jest.unstable_mockModule('./unused.mjs', unusedFactory);

const consumer = await import('./consumer.mjs');

test('awaits an async factory reached through a static ESM import', () => {
  expect(consumer.consumed).toBe('mocked transitive dependency');
  expect(consumer.consumedSecond).toBe('mocked second dependency');
  expect(consumer.packageResult).toBe(42);
  expect(consumer.platformResult).toBe('mocked-platform');
  expect(factory).toHaveBeenCalledTimes(1);
  expect(secondFactory).toHaveBeenCalledTimes(1);
  expect(packageFactory).toHaveBeenCalledTimes(1);
  expect(builtinFactory).toHaveBeenCalledTimes(1);
  expect(unusedFactory).not.toHaveBeenCalled();
  for (const name of ['second', 'package', 'builtin', 'first']) {
    expect(events.indexOf(`${name}:start`) < events.indexOf(`${name}:end`)).toBe(true);
  }
  for (const rootDependency of ['second', 'package', 'builtin']) {
    expect(
      events.indexOf(`${rootDependency}:start`) < events.indexOf('first:start'),
    ).toBe(true);
  }
});
