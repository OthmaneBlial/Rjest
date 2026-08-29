import {add, canonicalAnswer} from 'rjest-resolution-fixture/math';

describe('ESM package resolution', () => {
  test('honors package exports self-reference', () => {
    expect(add(20, 22)).toBe(42);
  });

  test('loads multiple named exports', () => {
    expect(canonicalAnswer).toBe(42);
  });
});
