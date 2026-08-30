test('matches nth and last returned values', () => {
  const fn = jest
    .fn()
    .mockReturnValueOnce({id: 1, label: 'first'})
    .mockReturnValueOnce({id: 2, label: 'second'})
    .mockReturnValueOnce({id: 3, label: 'last'});

  fn();
  fn();
  fn();

  expect(fn).toHaveNthReturnedWith(1, expect.objectContaining({id: 1}));
  expect(fn).toHaveNthReturnedWith(2, {id: 2, label: 'second'});
  expect(fn).toHaveLastReturnedWith({id: 3, label: 'last'});
  expect(fn).not.toHaveNthReturnedWith(3, {id: 2, label: 'second'});
  expect(fn).not.toHaveLastReturnedWith({id: 1, label: 'first'});
});

test('does not treat thrown calls as returned values', () => {
  const fn = jest.fn(() => {
    throw new Error('boom');
  });

  expect(fn).not.toHaveLastReturnedWith(undefined);
  expect(fn).not.toHaveNthReturnedWith(1, undefined);

  expect(() => fn()).toThrow('boom');

  expect(fn).not.toHaveLastReturnedWith(undefined);
  expect(fn).not.toHaveNthReturnedWith(1, undefined);
});

test('does not treat recursive calls in progress as returned values', () => {
  const sum = jest.fn(value => {
    if (value === 0) {
      expect(sum).not.toHaveLastReturnedWith(undefined);
      expect(sum).not.toHaveNthReturnedWith(1, undefined);
      return 0;
    }
    return value + sum(value - 1);
  });

  expect(sum(3)).toBe(6);
  expect(sum).toHaveNthReturnedWith(1, 6);
  expect(sum).toHaveNthReturnedWith(2, 3);
  expect(sum).toHaveNthReturnedWith(3, 1);
  expect(sum).toHaveLastReturnedWith(0);
});

test('requires a Jest mock function', () => {
  const ordinaryFunction = () => 'value';

  expect(() =>
    expect(ordinaryFunction).toHaveLastReturnedWith('value'),
  ).toThrow(/mock function/);
  expect(() =>
    expect(ordinaryFunction).toHaveNthReturnedWith(1, 'value'),
  ).toThrow(/mock function/);
});

test('rejects invalid nth return positions', () => {
  const fn = jest.fn(() => 'value');
  fn();

  expect(() => expect(fn).toHaveNthReturnedWith(0, 'value')).toThrow(
    /positive integer/,
  );
  expect(() => expect(fn).toHaveNthReturnedWith(1.5, 'value')).toThrow(
    /positive integer/,
  );
  expect(() => expect(fn).toHaveNthReturnedWith(undefined, 'value')).toThrow(
    /positive integer/,
  );
  expect(() => expect(fn).toHaveBeenNthCalledWith(0)).toThrow(
    /positive integer/,
  );
  expect(() => expect(fn).toHaveBeenNthCalledWith(1.5)).toThrow(
    /positive integer/,
  );
});
