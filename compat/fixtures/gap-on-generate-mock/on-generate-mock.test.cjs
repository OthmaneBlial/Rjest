const {basename} = require('node:path');

const calls = [];
jest.onGenerateMock((modulePath, mock) => {
  calls.push(`first:${basename(modulePath)}`);
  mock.read.mockReturnValue('configured by first callback');
  mock.callbackOrder = 'first';
  return mock;
});
jest.onGenerateMock((modulePath, mock) => {
  calls.push(`second:${basename(modulePath)}`);
  return {...mock, callbackOrder: `${mock.callbackOrder}:second`};
});

test('onGenerateMock callbacks transform generated mocks in registration order', () => {
  const service = require('./service.cjs');

  expect(service.read()).toBe('configured by first callback');
  expect(service.callbackOrder).toBe('first:second');
  expect(calls).toEqual(['first:service.cjs', 'second:service.cjs']);
  expect(require('./service.cjs')).toBe(service);
});

test('manual mocks skip callbacks while regenerated mocks notify again', () => {
  expect(require('./manual.cjs')).toEqual({tag: 'authored manual mock'});
  expect(calls).toHaveLength(2);

  const before = require('./service.cjs');
  jest.resetModules();
  const after = require('./service.cjs');

  expect(after).not.toBe(before);
  expect(after.callbackOrder).toBe('first:second');
  expect(calls).toEqual([
    'first:service.cjs',
    'second:service.cjs',
    'first:service.cjs',
    'second:service.cjs',
  ]);
});
