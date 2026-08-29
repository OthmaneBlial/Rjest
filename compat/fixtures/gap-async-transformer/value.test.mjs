import {expect, test} from '@jest/globals';
import {value} from './value.mjs';

test('awaits a processAsync-only ESM transformer', () => {
  expect(value).toBe(73);
});
