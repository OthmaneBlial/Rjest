test.each([
  {label: 'alpha', nested: {value: 7}},
  {label: 'beta', nested: {value: 9}},
])('$label uses $nested.value at row $#', ({label, nested}) => {
  expect(`${label}:${nested.value}`).toMatch(/^(alpha:7|beta:9)$/);
});

describe.each([{group: 'first'}, {group: 'second'}])('$group group', ({group}) => {
  test('keeps the interpolated suite name', () => {
    expect(group).toBeDefined();
  });
});

test.each([[{enabled: true}], [{enabled: false}]])(
  'pretty row %p is number %$',
  value => {
    expect(typeof value.enabled).toBe('boolean');
  },
);
