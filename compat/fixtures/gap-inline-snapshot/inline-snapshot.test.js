test('matches an inline snapshot', () => {
  expect('inline value').toMatchInlineSnapshot(`"inline value"`);
});

test('removes source indentation and preserves embedded quotes', () => {
  expect({message: 'say "hello"', nested: {ready: true}})
    .toMatchInlineSnapshot(`
      {
        "message": "say "hello"",
        "nested": {
          "ready": true,
        },
      }
    `);
});

test('omits function names in snapshot values', () => {
  expect({handler: function namedHandler() {}}).toMatchInlineSnapshot(`
    {
      "handler": [Function],
    }
  `);
});
