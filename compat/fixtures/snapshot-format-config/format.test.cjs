test('uses configured pretty-format snapshot options', () => {
  expect({message: 'quoted "value"', nested: {answer: 42}}).toMatchSnapshot();
});
