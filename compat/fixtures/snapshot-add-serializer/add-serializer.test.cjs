test('registers a legacy print serializer and returns undefined', () => {
  const registration = expect.addSnapshotSerializer({
    test(value) {
      return value?.fixtureKind === 'legacy';
    },
    print(value, serialize) {
      return `Legacy(${serialize(value.value)})`;
    },
  });

  expect(registration).toBeUndefined();
  expect({nested: {fixtureKind: 'legacy', value: 'alpha'}})
    .toMatchInlineSnapshot(`
{
  "nested": Legacy("alpha"),
}
`);
});

test('tests the last registered serializer first', () => {
  expect.addSnapshotSerializer({
    test(value) {
      return value?.fixtureKind === 'priority';
    },
    print(value) {
      return `First(${value.value})`;
    },
  });
  expect.addSnapshotSerializer({
    test(value) {
      return value?.fixtureKind === 'priority';
    },
    print(value) {
      return `Last(${value.value})`;
    },
  });

  expect({fixtureKind: 'priority', value: 'beta'})
    .toMatchInlineSnapshot(`Last(beta)`);
});

test('supports modern serialize plugins and recursive printers', () => {
  expect.addSnapshotSerializer({
    test(value) {
      return value?.fixtureKind === 'modern';
    },
    serialize(value, config, indentation, depth, refs, printer) {
      return `Modern(${printer(
        value.value,
        config,
        indentation,
        depth,
        refs,
      )})`;
    },
  });

  expect({fixtureKind: 'modern', value: ['gamma']})
    .toMatchInlineSnapshot(`
Modern([
  "gamma",
])
`);
});
