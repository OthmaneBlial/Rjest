const events = [];

test('root alpha', () => {
  events.push('root alpha');
});
test('root bravo', () => {
  events.push('root bravo');
});

describe('nested suite', () => {
  test('nested alpha', () => {
    events.push('nested alpha');
  });
  test('nested bravo', () => {
    events.push('nested bravo');
  });
  test('nested charlie', () => {
    events.push('nested charlie');
  });

  describe('deep suite', () => {
    test('deep alpha', () => {
      events.push('deep alpha');
    });
    test('deep bravo', () => {
      events.push('deep bravo');
    });
  });
});

afterAll(() => {
  expect(events).toEqual([
    'root alpha',
    'nested alpha',
    'nested charlie',
    'deep alpha',
    'deep bravo',
    'nested bravo',
    'root bravo',
  ]);
});
