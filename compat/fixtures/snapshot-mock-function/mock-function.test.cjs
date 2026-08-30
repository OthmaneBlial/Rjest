test('serializes a called spy with Jest mock metadata', () => {
  const target = {warn() {}};
  const spy = jest.spyOn(target, 'warn').mockImplementation(() => undefined);
  spy('warning', {id: 1});

  expect(spy).toMatchSnapshot();
});
