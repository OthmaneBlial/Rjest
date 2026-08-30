test('consumes a snapshot with the legacy Jest v1 header', () => {
  expect({stable: true}).toMatchSnapshot();
});
