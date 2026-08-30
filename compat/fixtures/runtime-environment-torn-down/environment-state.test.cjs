test('reports an active environment while tests are running', () => {
  captureEnvironmentState(() => jest.isEnvironmentTornDown());
  expect(jest.isEnvironmentTornDown()).toBe(false);
});
