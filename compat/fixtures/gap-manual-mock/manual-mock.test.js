jest.mock('./service');

const service = require('./service');

test('loads the adjacent manual mock', () => {
  expect(service.source).toBe('manual');
  expect(service.value()).toBe(42);
  expect(service.value).toHaveBeenCalledTimes(1);
});

test('resolves a bare module from an ancestor manual mock directory', () => {
  expect(require.resolve('fixture-bare-tool')).toContain('__mocks__');
  expect(require('fixture-bare-tool')).toEqual({source: 'bare manual mock'});
});

test('prefers a root manual mock for an installed package', () => {
  jest.mock('@rjest-fixture/math');
  expect(require('@rjest-fixture/math')).toEqual({source: 'package manual mock'});
});
