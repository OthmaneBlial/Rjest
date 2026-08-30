test('uses the formatter version bundled with the installed Jest', () => {
  expect({
    $$typeof: Symbol.for('react.transitional.element'),
    _owner: null,
    _store: {},
    key: 'fixture',
    props: {'data-styled': ''},
    type: 'style',
  }).toMatchInlineSnapshot(`
    {
      "$$typeof": Symbol(react.transitional.element),
      "_owner": null,
      "_store": {},
      "key": "fixture",
      "props": {
        "data-styled": "",
      },
      "type": "style",
    }
  `);
});
