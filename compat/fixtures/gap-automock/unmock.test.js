jest.unmock('./unmocked.js');

const unmocked = require('./unmocked.js');
const factory = require('./factory.js');

jest.mock('./factory.js', () => ({kind: 'factory'}));

test('keeps unmock and hoisted factory decisions above global automock', () => {
  expect(unmocked()).toBe('unmocked actual');
  expect(jest.isMockFunction(unmocked)).toBe(false);
  expect(factory).toEqual({kind: 'factory'});
});
