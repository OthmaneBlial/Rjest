test('uses the configured automatic advance interval', done => {
  const start = Date.now();

  setTimeout(() => {
    expect(Date.now() - start).toBe(35);
    done();
  }, 35);
});

test('uses Jest default advancement when explicitly enabled with true', done => {
  jest.useFakeTimers({advanceTimers: true, now: 2000});
  const start = Date.now();

  setTimeout(() => {
    expect(Date.now() - start).toBe(45);
    done();
  }, 45);
});
