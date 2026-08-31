const {JestAssertionError} = require('expect');

test('failed assertions use Jest assertion error identity', () => {
  let error;
  try {
    expect(1).toBe(2);
  } catch (caught) {
    error = caught;
  }

  expect(error).toBeInstanceOf(Error);
  expect(error).toBeInstanceOf(JestAssertionError);
  expect(error.name).toBe('Error');
  expect(error.constructor.name).toBe('JestAssertionError');
});

test('custom matcher failures use the same exported error class', () => {
  expect.extend({
    toFail() {
      return {message: () => 'custom failure', pass: false};
    },
  });

  let error;
  try {
    expect('value').toFail();
  } catch (caught) {
    error = caught;
  }

  expect(error).toBeInstanceOf(JestAssertionError);
  expect(error.name).toBe('Error');
  expect(error.constructor.name).toBe('JestAssertionError');
});
