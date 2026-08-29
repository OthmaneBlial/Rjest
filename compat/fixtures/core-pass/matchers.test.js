test('common matchers', async () => {
  expect(true).toBeTruthy();
  expect(false).toBeFalsy();
  expect(null).toBeNull();
  expect(undefined).toBeUndefined();
  expect('value').toBeDefined();
  expect(Number.NaN).toBeNaN();
  expect('native rust').toContain('rust');
  expect([{id: 1}]).toContainEqual({id: 1});
  expect([1, 2, 3]).toHaveLength(3);
  expect({nested: {value: 7}}).toHaveProperty('nested.value', 7);
  expect('hello Jest').toMatch(/jest/i);
  expect({a: 1, nested: {b: 2, c: 3}}).toMatchObject({nested: {b: 2}});
  expect(() => {
    throw new TypeError('boom');
  }).toThrow(TypeError);
  expect({a: 1}).not.toEqual({a: 2});
  await expect(Promise.reject(new Error('nope'))).rejects.toThrow('nope');
});
