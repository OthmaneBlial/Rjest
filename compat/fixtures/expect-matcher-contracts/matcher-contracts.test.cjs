test('matches same-sign infinities with toBeCloseTo', () => {
  expect(Number.POSITIVE_INFINITY).toBeCloseTo(Number.POSITIVE_INFINITY);
  expect(Number.NEGATIVE_INFINITY).toBeCloseTo(Number.NEGATIVE_INFINITY);
  expect(Number.POSITIVE_INFINITY).not.toBeCloseTo(Number.NEGATIVE_INFINITY);
});

test('requires numeric values for toBeCloseTo', () => {
  expect(() => expect(1).toBeCloseTo('1')).toThrow(/expected.*number/i);
  expect(() => expect('1').toBeCloseTo(1)).toThrow(/received.*number/i);
});

test('requires numbers or bigints for ordering matchers', () => {
  expect(3n).toBeGreaterThan(2);
  expect(2).toBeLessThanOrEqual(3n);
  expect(() => expect('10').toBeGreaterThan(2)).toThrow(
    /received.*number or bigint/i,
  );
  expect(() => expect(2).toBeLessThan('10')).toThrow(
    /expected.*number or bigint/i,
  );
});

test('requires a constructor for toBeInstanceOf', () => {
  expect(() => expect({}).toBeInstanceOf(42)).toThrow(
    /expected.*function/i,
  );
});

test('validates toHaveLength inputs', () => {
  expect(() => expect({length: '2'}).toHaveLength(2)).toThrow(
    /length property.*number/i,
  );
  expect(() => expect([1, 2]).toHaveLength(-1)).toThrow(
    /non-negative integer/i,
  );
  expect(() => expect([1, 2]).toHaveLength(1.5)).toThrow(
    /non-negative integer/i,
  );
  expect(() => expect([1, 2]).toHaveLength(Number.POSITIVE_INFINITY)).toThrow(
    /non-negative integer/i,
  );
});

test('does not coerce a substring passed to toContain', () => {
  expect(() => expect('123').toContain(2)).toThrow(/expected.*string/i);
  expect(() => expect(null).toContain('value')).toThrow(
    /received.*not be null nor undefined/i,
  );
});

test('validates toMatch and does not mutate RegExp state', () => {
  expect(() => expect(123).toMatch('23')).toThrow(/received.*string/i);
  expect(() => expect('123').toMatch(23)).toThrow(
    /expected.*string or regular expression/i,
  );

  const pattern = /foo/g;
  pattern.lastIndex = 3;
  expect('foo').toMatch(pattern);
  expect(pattern.lastIndex).toBe(3);
});

test('validates toMatchObject operands', () => {
  expect(() => expect('value').toMatchObject({})).toThrow(
    /received.*non-null object/i,
  );
  expect(() => expect({}).toMatchObject(null)).toThrow(
    /expected.*non-null object/i,
  );
});

test('validates toHaveProperty paths and received values', () => {
  expect(() => expect({}).toHaveProperty([])).toThrow(
    /path must not be an empty array/i,
  );
  expect(() => expect({}).toHaveProperty(42)).toThrow(
    /path must be a string or array/i,
  );
  expect(() => expect(null).toHaveProperty('value')).toThrow(
    /received.*not be null nor undefined/i,
  );
});
