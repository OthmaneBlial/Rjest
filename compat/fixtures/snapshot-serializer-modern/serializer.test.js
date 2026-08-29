test('loads serialize-style plugins after the environment', () => {
  expect({rjestSerializerFixture: true, label: 'value'}).toMatchSnapshot();
});
