test('failed built-in matchers expose Jest structured matcher results', () => {
  const actual = {value: 1};
  const expected = {value: 2};

  let error;
  try {
    expect(actual).toEqual(expected);
  } catch (caught) {
    error = caught;
  }

  expect(error).toBeDefined();
  expect(error.matcherResult).toEqual(
    expect.objectContaining({
      actual,
      expected,
      name: 'toEqual',
      pass: false,
    })
  );
  expect(typeof error.matcherResult.message).toBe('string');
});

test('negated matcher failures retain the underlying matcher pass result', () => {
  let error;
  try {
    expect('same').not.toBe('same');
  } catch (caught) {
    error = caught;
  }

  expect(error).toBeDefined();
  expect(error.matcherResult).toEqual(
    expect.objectContaining({
      actual: 'same',
      expected: 'same',
      name: 'toBe',
      pass: true,
    })
  );
});

test('custom matcher results remain available on the assertion error', () => {
  expect.extend({
    toBeTagged(received, expected) {
      return {
        actual: received,
        diagnostic: 'preserved',
        expected,
        message: () => 'custom matcher failed',
        name: 'toBeTagged',
        pass: false,
      };
    },
  });

  let error;
  try {
    expect('actual').toBeTagged('expected');
  } catch (caught) {
    error = caught;
  }

  expect(error.matcherResult).toEqual({
    actual: 'actual',
    diagnostic: 'preserved',
    expected: 'expected',
    message: 'custom matcher failed',
    name: 'toBeTagged',
    pass: false,
  });
});
