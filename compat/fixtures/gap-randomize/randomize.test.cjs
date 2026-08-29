const events = [];

for (const name of ['alpha', 'bravo', 'charlie', 'delta', 'echo']) {
  test(name, () => {
    events.push(name);
  });
}

afterAll(() => {
  expect(events).toEqual(['delta', 'charlie', 'echo', 'alpha', 'bravo']);
});
