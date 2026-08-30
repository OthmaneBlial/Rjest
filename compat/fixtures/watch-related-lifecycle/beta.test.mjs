import {value} from './beta.mjs';

test('beta uses only the beta dependency', () => {
  expect(value).toBe('beta');
});
