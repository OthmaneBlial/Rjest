afterAll(() => {
  Promise.reject(new Error('unhandled from afterAll'));
});

test('the test passes before the suite-level rejection', () => {});
