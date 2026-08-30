const RealDate = Date;

afterEach(() => {
  jest.useRealTimers();
});

test('modern fake timers expose the Sinon Date marker', () => {
  jest.useFakeTimers();

  expect(Date).not.toBe(RealDate);
  expect(Date.isFake).toBe(true);

  jest.useRealTimers();

  expect(Date).toBe(RealDate);
  expect(Date.isFake).toBeUndefined();
});

test('excluding Date leaves the native constructor unmarked', () => {
  jest.useFakeTimers({doNotFake: ['Date']});

  expect(Date).toBe(RealDate);
  expect(Date.isFake).toBeUndefined();
});
