import {expect, jest, test} from '@jest/globals';

globalThis.__rjestResetActualEvaluations = 0;

const firstActual = await import('./actual.mjs');
const firstResetResult = jest.resetModules();
const secondActual = await import('./actual.mjs');

const factory = jest.fn(() => ({evaluation: factory.mock.calls.length}));
jest.unstable_mockModule('./mock-target.mjs', factory);
const firstMock = await import('./mock-target.mjs');
const secondResetResult = jest.resetModules();
const secondMock = await import('./mock-target.mjs');

test('resetModules creates fresh actual and mocked ESM instances', () => {
  expect(firstResetResult).toBe(jest);
  expect(secondResetResult).toBe(jest);
  expect(firstActual.evaluation).toBe(1);
  expect(secondActual.evaluation).toBe(2);
  expect(secondActual).not.toBe(firstActual);
  expect(firstMock.evaluation).toBe(1);
  expect(secondMock.evaluation).toBe(2);
  expect(secondMock).not.toBe(firstMock);
  expect(factory).toHaveBeenCalledTimes(2);
});
