const callback = jest.fn();

test('records calls in the current test', () => {
  callback('first');
  expect(callback).toHaveBeenCalledWith('first');
});

test('clears mock usage before the next test', () => {
  expect(callback).not.toHaveBeenCalled();
});
