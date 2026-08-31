test('records a new snapshot outside CI', () => {
  expect({answer: 42}).toMatchSnapshot();
});
