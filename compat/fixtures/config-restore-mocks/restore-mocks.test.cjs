const target = {
  method() {
    return 'actual method';
  },
  value: 'actual value',
};

test('a test can install spies and property replacements', () => {
  jest.spyOn(target, 'method').mockReturnValue('mocked method');
  jest.replaceProperty(target, 'value', 'mocked value');

  expect(target.method()).toBe('mocked method');
  expect(target.value).toBe('mocked value');
});

test('restoreMocks restores both before the next test', () => {
  expect(target.method()).toBe('actual method');
  expect(target.value).toBe('actual value');
});
