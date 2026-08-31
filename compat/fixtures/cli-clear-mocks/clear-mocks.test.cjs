const callback = jest.fn();

test('records calls in the first test', () => {
  callback('first');
  expect(callback).toHaveBeenCalledTimes(1);
});

test('clears usage before the next test', () => {
  expect(callback).not.toHaveBeenCalled();
});
