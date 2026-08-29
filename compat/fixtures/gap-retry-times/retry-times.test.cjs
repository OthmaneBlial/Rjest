let attempts = 0;
let beforeCalls = 0;
let afterCalls = 0;

expect(jest.retryTimes(2)).toBe(jest);

beforeEach(() => {
  beforeCalls += 1;
});

afterEach(() => {
  afterCalls += 1;
});

test('retryTimes reruns a failing test until it passes', () => {
  attempts += 1;
  expect(attempts).toBe(3);
});

test('retryTimes reruns beforeEach and afterEach around each attempt', () => {
  expect(attempts).toBe(3);
  expect(beforeCalls).toBe(6);
  expect(afterCalls).toBe(5);
});
