const {full} = require('./src/full');
const {partial} = require('./src/partial');

test('leaves one source branch uncovered', () => {
  expect(full(1)).toBe(2);
  expect(partial(true)).toBe('covered');
});
