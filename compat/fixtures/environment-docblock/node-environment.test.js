/**
 * @jest-environment node
 */

test('uses the test-file environment override', () => {
  expect(typeof window).toBe('undefined');
  expect(typeof document).toBe('undefined');
});
