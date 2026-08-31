test('reports Jest expected types for asymmetric matchers', () => {
  class Widget {}

  expect(expect.any(String).getExpectedType()).toBe('string');
  expect(expect.any(Number).getExpectedType()).toBe('number');
  expect(expect.any(Function).getExpectedType()).toBe('function');
  expect(expect.any(Object).getExpectedType()).toBe('object');
  expect(expect.any(Boolean).getExpectedType()).toBe('boolean');
  expect(expect.any(Array).getExpectedType()).toBe('array');
  expect(expect.any(Widget).getExpectedType()).toBe('Widget');
  expect(expect.arrayContaining([]).getExpectedType()).toBe('array');
  expect(expect.not.arrayContaining([]).getExpectedType()).toBe('array');
  expect(expect.arrayOf(expect.anything()).getExpectedType()).toBe('array');
  expect(expect.objectContaining({}).getExpectedType()).toBe('object');
  expect(expect.stringContaining('value').getExpectedType()).toBe('string');
  expect(expect.stringMatching(/value/).getExpectedType()).toBe('string');
  expect(expect.closeTo(1).getExpectedType()).toBe('number');
});

test('reports custom matcher types and formatting without typing anything', () => {
  expect.extend({
    toBeReady(received) {
      return {message: () => 'expected ready', pass: received === 'ready'};
    },
  });

  expect(typeof expect.anything().getExpectedType).toBe('undefined');
  expect(expect.toBeReady().getExpectedType()).toBe('any');
  expect(expect.toBeReady().toAsymmetricMatcher()).toBe('toBeReady<>');
  expect(expect.not.toBeReady('soon').toAsymmetricMatcher()).toBe(
    'not.toBeReady<soon>',
  );
});
