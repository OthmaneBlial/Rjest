test('rejects arguments for matchers that take none', () => {
  const cases = [
    [true, 'toBeDefined'],
    [false, 'toBeFalsy'],
    [Number.NaN, 'toBeNaN'],
    [null, 'toBeNull'],
    [true, 'toBeTruthy'],
    [undefined, 'toBeUndefined'],
  ];

  for (const [received, matcher] of cases) {
    expect(() => expect(received)[matcher]('unexpected')).toThrow(
      /must not have an expected argument/i,
    );
  }
});

test('rejects arguments for zero-argument mock matchers', () => {
  const mock = jest.fn(() => 'value');
  mock();

  expect(() => expect(mock).toHaveBeenCalled('unexpected')).toThrow(
    /must not have an expected argument/i,
  );
  expect(() => expect(mock).toHaveReturned('unexpected')).toThrow(
    /must not have an expected argument/i,
  );
});

test('validates call and return count arguments', () => {
  const mock = jest.fn();

  for (const invalid of [-1, 1.5, Number.POSITIVE_INFINITY, '0']) {
    expect(() => expect(mock).toHaveBeenCalledTimes(invalid)).toThrow(
      /non-negative integer/i,
    );
    expect(() => expect(mock).toHaveReturnedTimes(invalid)).toThrow(
      /non-negative integer/i,
    );
  }
});

test('validates receivers for call matchers', () => {
  const plain = () => undefined;
  const assertions = [
    () => expect(plain).toHaveBeenCalled(),
    () => expect(plain).toHaveBeenCalledTimes(0),
    () => expect(plain).toHaveBeenCalledWith('value'),
    () => expect(plain).toHaveBeenLastCalledWith('value'),
    () => expect(plain).toHaveBeenNthCalledWith(1, 'value'),
  ];

  for (const assertion of assertions) {
    expect(assertion).toThrow(/received.*mock or spy function/i);
  }
});

test('validates receivers for return matchers', () => {
  const plain = () => undefined;
  const assertions = [
    () => expect(plain).toHaveReturned(),
    () => expect(plain).toHaveReturnedTimes(0),
    () => expect(plain).toHaveReturnedWith('value'),
    () => expect(plain).toHaveLastReturnedWith('value'),
    () => expect(plain).toHaveNthReturnedWith(1, 'value'),
  ];

  for (const assertion of assertions) {
    expect(assertion).toThrow(/received.*mock function/i);
  }
});

test('validates positive call and return indexes', () => {
  const mock = jest.fn();

  for (const invalid of [0, -1, 1.5, Number.POSITIVE_INFINITY]) {
    expect(() => expect(mock).toHaveBeenNthCalledWith(invalid)).toThrow(
      /n must be a positive integer/i,
    );
    expect(() => expect(mock).toHaveNthReturnedWith(invalid)).toThrow(
      /n must be a positive integer/i,
    );
  }
});

test('supports Jasmine-compatible spy call records', () => {
  const records = [{args: ['first']}, {args: ['second', 2]}];
  const spy = {
    calls: {
      all: () => records,
      count: () => records.length,
    },
  };

  expect(spy).toHaveBeenCalled();
  expect(spy).toHaveBeenCalledTimes(2);
  expect(spy).toHaveBeenCalledWith('first');
  expect(spy).toHaveBeenLastCalledWith('second', 2);
  expect(spy).toHaveBeenNthCalledWith(2, 'second', 2);
});

test('keeps valid zero counts and excludes thrown calls from returns', () => {
  const untouched = jest.fn();
  expect(untouched).toHaveBeenCalledTimes(0);
  expect(untouched).toHaveReturnedTimes(0);

  const mock = jest.fn(() => {
    throw new Error('boom');
  });
  expect(() => mock()).toThrow('boom');
  expect(mock).toHaveBeenCalledTimes(1);
  expect(mock).toHaveReturnedTimes(0);
  expect(mock).not.toHaveReturned();
});
