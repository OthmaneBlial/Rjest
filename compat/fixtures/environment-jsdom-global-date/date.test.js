const RealDate = Date;
const fixedDate = new RealDate('2024-01-01T17:30:00Z');
const dateSpy = jest.spyOn(global, 'Date').mockImplementation(() => fixedDate);

afterAll(() => dateSpy.mockRestore());

test('isolates JSDOM internals from a mocked global Date constructor', () => {
  expect(new Date()).toBe(fixedDate);
});
