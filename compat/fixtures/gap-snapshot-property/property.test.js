test('applies property matchers before snapshot serialization', () => {
  expect({id: 9341, name: 'Ada'}).toMatchSnapshot({id: expect.any(Number)});
});
