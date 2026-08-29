const {basename} = require('node:path');

const calls = [];
const callback = (modulePath, mock) => {
  calls.push(basename(modulePath));
  return {...mock, touchedByCallback: true};
};

expect(jest.onGenerateMock(callback)).toBe(jest);
jest.onGenerateMock(callback);

test('duplicate callbacks run once and createMockFromModule always notifies', () => {
  const first = jest.createMockFromModule('./created.cjs');
  const second = jest.createMockFromModule('./created.cjs');

  expect(first.touchedByCallback).toBe(true);
  expect(second.touchedByCallback).toBe(true);
  expect(first).not.toBe(second);
  expect(calls).toEqual(['created.cjs', 'created.cjs']);
});

test('an explicit CommonJS factory does not notify generated-mock callbacks', () => {
  jest.doMock('./explicit.cjs', () => ({tag: 'explicit CommonJS factory'}));

  expect(require('./explicit.cjs')).toEqual({tag: 'explicit CommonJS factory'});
  expect(calls).toEqual(['created.cjs', 'created.cjs']);
});
