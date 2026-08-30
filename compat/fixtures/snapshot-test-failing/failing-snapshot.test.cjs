test.failing('keeps existing snapshots unchanged in a failing test', () => {
  expect('new').toMatchSnapshot();
});

test.failing('does not write a missing inline snapshot', () => {
  expect('new inline value').toMatchInlineSnapshot();
});
