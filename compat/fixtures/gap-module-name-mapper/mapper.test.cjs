jest.mock('@mocked', () => 'mocked');

const value = require('@ordered/value');

test('uses the first matching moduleNameMapper rule and expands captures', () => {
  expect(value).toBe('mapped');
  expect(require.resolve('@ordered/value')).toMatch(/src[/\\]value\.js$/);
});

test('tries moduleNameMapper targets in order', () => {
  expect(require('@fallback')).toBe('fallback');
});

test('shares mapped module identity with Jest module mocks', () => {
  expect(require('@mocked')).toBe('mocked');
  expect(jest.requireActual('@mocked')).toBe('actual');
});
