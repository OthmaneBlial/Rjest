test('applies property matchers before snapshot serialization', () => {
  expect({id: 9341, name: 'Ada'}).toMatchSnapshot({id: expect.any(Number)});
});

test('deep-merges nested and array property matchers without mutating received', () => {
  const received = {
    user: {id: 9341, name: 'Ada'},
    tags: ['stable', 'dynamic'],
  };

  expect(received).toMatchSnapshot(
    {
      user: {id: expect.any(Number)},
      tags: [expect.stringMatching(/^sta/), expect.any(String)],
    },
    'nested properties',
  );
  expect(received.user.id).toBe(9341);
});

test('applies property matchers to existing inline snapshots', () => {
  expect({id: 9341, name: 'Ada'}).toMatchInlineSnapshot(
    {id: expect.any(Number)},
    `
{
  "id": Any<Number>,
  "name": "Ada",
}
`,
  );
});
