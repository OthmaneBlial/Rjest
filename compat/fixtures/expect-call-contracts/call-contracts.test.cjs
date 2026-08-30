test('allows zero or one argument', () => {
  expect(expect()).toBeDefined();
  expect(expect('value')).toBeDefined();
});

test('rejects more than one argument', () => {
  expect(() => expect('value', 'extra')).toThrow(
    'Expect takes at most one argument.',
  );
  expect(() => expect(undefined, undefined)).toThrow(
    'Expect takes at most one argument.',
  );
});
