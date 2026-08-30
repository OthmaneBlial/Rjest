test('shares matcher state with the installed expect package', () => {
  expect(42).toBeFortyTwo();
  expect(7).not.toBeFortyTwo();
  expect({answer: 42}).toEqual({answer: expect.toBeFortyTwo()});
  expect({answer: 7}).toEqual({answer: expect.not.toBeFortyTwo()});
});
