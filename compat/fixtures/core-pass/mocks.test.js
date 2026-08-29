test('jest.fn tracks calls and ordered implementations', async () => {
  const mock = jest
    .fn(value => `default:${value}`)
    .mockReturnValueOnce('first')
    .mockResolvedValueOnce('second');

  expect(mock('a')).toBe('first');
  await expect(mock('b')).resolves.toBe('second');
  expect(mock('c')).toBe('default:c');
  expect(mock).toHaveBeenCalledTimes(3);
  expect(mock).toHaveBeenCalledWith('b');
  expect(mock.mock.calls).toEqual([['a'], ['b'], ['c']]);
  expect(mock.mock.results.map(result => result.type)).toEqual([
    'return',
    'return',
    'return',
  ]);
});

test('jest.spyOn restores the original method', () => {
  const calculator = {add: (left, right) => left + right};
  const spy = jest.spyOn(calculator, 'add');
  expect(calculator.add(2, 4)).toBe(6);
  expect(spy).toHaveBeenLastCalledWith(2, 4);
  spy.mockRestore();
  expect(calculator.add(3, 5)).toBe(8);
});
