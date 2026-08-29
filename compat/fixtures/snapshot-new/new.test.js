test('writes a missing snapshot', () => {
  expect({engine: 'rust', runtime: 'node', stable: true}).toMatchSnapshot();
});
