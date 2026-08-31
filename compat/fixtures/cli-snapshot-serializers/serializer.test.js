test('loads the snapshot serializer supplied on the command line', () => {
  expect({rjestCliSerializerFixture: true, label: 'cli'}).toMatchSnapshot();
});
