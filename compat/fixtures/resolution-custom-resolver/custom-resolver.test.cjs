jest.mock('virtual-target', () => ({value: 'mocked-custom-target'}));

test('uses require conditions and canonical mock identities', () => {
  expect(require('condition-target').condition).toBe('require');
  expect(require('virtual-target').value).toBe('mocked-custom-target');
  expect(jest.requireActual('virtual-target').value).toBe(
    'actual-custom-target',
  );
});

test('delegates ordinary CommonJS packages to defaultResolver', () => {
  expect(require('@rjest-fixture/math').condition).toBe('require');
});
