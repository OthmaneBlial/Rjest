import {value} from './beta.mjs';

test('beta follows its native ESM dependency', () => {
  expect(value).toBe('beta');
});
