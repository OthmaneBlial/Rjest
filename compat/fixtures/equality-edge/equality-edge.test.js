test('matches Jest deep equality edge cases', () => {
  expect({value: undefined}).toEqual({});
  expect([, 1]).toEqual([undefined, 1]);
  expect([, 1]).not.toStrictEqual([undefined, 1]);
  expect([]).not.toEqual({});
  expect(new String('alpha')).toEqual(new String('alpha'));
  expect(new String('alpha')).not.toEqual(new String('beta'));
  expect(new URL('https://example.com/one')).toEqual(
    new URL('https://example.com/one'),
  );
  expect(new URL('https://example.com/one')).not.toEqual(
    new URL('https://example.com/two'),
  );
  expect(new Date(Number.NaN)).not.toEqual(new Date(Number.NaN));
});

test('compares cycles and unordered collections structurally', () => {
  const left = {name: 'cycle'};
  const right = {name: 'cycle'};
  left.self = left;
  right.self = right;
  expect(left).toEqual(right);
  expect(new Set([{id: 1}, {id: 2}])).toEqual(
    new Set([{id: 2}, {id: 1}]),
  );
  expect(new Map([[{id: 1}, {name: 'Ada'}]])).toEqual(
    new Map([[{id: 1}, {name: 'Ada'}]]),
  );
});
