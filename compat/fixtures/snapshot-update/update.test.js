test('updates snapshot data', () => {
  expect({values: ['current'], version: 2}).toMatchSnapshot();
});
