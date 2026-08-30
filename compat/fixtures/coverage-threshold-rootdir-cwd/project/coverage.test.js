const {full} = require('./src/full');
const {partial} = require('./src/partial');

test('resolves threshold paths from the invocation directory', () => {
  expect(full(1)).toBe(2);
  expect(partial(true)).toBe('covered');
});
