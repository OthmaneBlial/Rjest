const assert = require('node:assert/strict');

test('extracts an exact assertion-count failure and resets local state', () => {
  expect.assertions(2);
  expect(true).toBe(true);

  const errors = expect.extractExpectedAssertionsErrors();
  assert.equal(errors.length, 1);
  assert.equal(errors[0].actual, '1');
  assert.equal(errors[0].expected, '2');
  assert.ok(errors[0].error instanceof Error);
  assert.match(
    errors[0].error.message,
    /Expected (?:two|2) assertions? to be called/,
  );

  const state = expect.getState();
  assert.equal(state.assertionCalls, 0);
  assert.equal(state.expectedAssertionsNumber, null);
  assert.equal(state.isExpectingAssertions, false);
  assert.equal(state.numPassingAsserts, 0);
});

test('extracts a missing hasAssertions failure', () => {
  expect.hasAssertions();

  const errors = expect.extractExpectedAssertionsErrors();
  assert.equal(errors.length, 1);
  assert.equal(errors[0].actual, 'none');
  assert.equal(errors[0].expected, 'at least one');
  assert.ok(errors[0].error instanceof Error);
  assert.match(errors[0].error.message, /Expected at least one assertion/);
});

test('returns no errors when the assertion contract is satisfied', () => {
  expect.assertions(1);
  expect('ready').toBe('ready');
  assert.deepEqual(expect.extractExpectedAssertionsErrors(), []);
});

test('rejects arguments passed to hasAssertions', () => {
  assert.throws(
    () => expect.hasAssertions(2),
    /must not have an expected argument|does not accept an argument/i,
  );
});
