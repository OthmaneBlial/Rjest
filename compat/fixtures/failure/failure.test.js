test('reports a matcher failure', () => {
  expect({answer: 41}).toEqual({answer: 42});
});

test('continues after a failure', () => {
  expect('still running').toContain('running');
});
