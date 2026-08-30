test("supports Jest special constructors and validates expect.any", () => {
  expect("value").toEqual(expect.any(String));
  expect(42).toEqual(expect.any(Number));
  expect(() => {}).toEqual(expect.any(Function));
  expect([]).toEqual(expect.any(Array));
  expect(null).toEqual(expect.any(Object));

  expect(() => expect.any()).toThrow(
    "any() expects to be passed a constructor function"
  );
});

test("preserves arrayContaining empty-sample and validation semantics", () => {
  expect("not an array").toEqual(expect.arrayContaining([]));
  expect({}).toEqual(expect.arrayContaining([]));
  expect(() => expect([]).toEqual(expect.arrayContaining("item"))).toThrow(
    "You must provide an array to ArrayContaining, not 'string'."
  );
  expect(() => expect([]).toEqual(expect.not.arrayContaining("item"))).toThrow(
    "You must provide an array to ArrayNotContaining, not 'string'."
  );
});

test("matches every element with expect.arrayOf", () => {
  expect([1, 2, 3]).toEqual(expect.arrayOf(expect.any(Number)));
  expect([{ id: 1 }, { id: 1 }]).toEqual(expect.arrayOf({ id: 1 }));
  expect([]).toEqual(expect.arrayOf("unused"));
});

test("inverts expect.arrayOf for arrays and non-arrays", () => {
  expect([1, 2]).toEqual(expect.not.arrayOf(1));
  expect("not an array").toEqual(expect.not.arrayOf(expect.anything()));
  expect([1, 1]).not.toEqual(expect.not.arrayOf(1));
});

test("supports expect.closeTo defaults, precision, and infinities", () => {
  expect({ amount: 1.229 }).toEqual({ amount: expect.closeTo(1.23) });
  expect(0.1).toEqual(expect.closeTo(0, 0));
  expect(0.0001).toEqual(expect.closeTo(0, 3));
  expect(Number.POSITIVE_INFINITY).toEqual(
    expect.closeTo(Number.POSITIVE_INFINITY)
  );
  expect(Number.NEGATIVE_INFINITY).toEqual(
    expect.closeTo(Number.NEGATIVE_INFINITY)
  );
  expect(expect.closeTo(1.23).toAsymmetricMatcher()).toBe(
    "NumberCloseTo 1.23 (2 digits)"
  );
  expect(expect.not.closeTo(1, 1).toAsymmetricMatcher()).toBe(
    "NumberNotCloseTo 1 (1 digit)"
  );
});

test("supports negated and nested numeric asymmetric matchers", () => {
  expect(1.2249).toEqual(expect.not.closeTo(1.23));
  expect(3e-7).toEqual(expect.not.closeTo(3.141592e-7, 8));
  expect([{ score: 9.996 }, { score: 10.004 }]).toEqual(
    expect.arrayOf(expect.objectContaining({ score: expect.closeTo(10) }))
  );
});

test("validates closeTo inputs like Jest", () => {
  expect(() => expect.closeTo("1")).toThrow("Expected is not a Number");
  expect(() => expect.not.closeTo(1, "2")).toThrow("Precision is not a Number");
});

test("validates and compiles string asymmetric matchers like Jest", () => {
  expect("queen").toEqual(expect.stringMatching("qu.e"));
  expect(() => expect.stringContaining(["queen"])).toThrow(
    "Expected is not a string"
  );
  expect(() => expect.not.stringMatching(42)).toThrow(
    "Expected is not a String or a RegExp"
  );
});

test("uses custom equality testers in Jest sample-first order", () => {
  expect.addEqualityTesters([
    (sample, received) => {
      if (sample?.role !== "sample" || received?.role !== "received") {
        return undefined;
      }
      return sample.value === received.value;
    },
  ]);

  expect([
    { role: "received", value: 1 },
    { role: "received", value: 1 },
  ]).toEqual(expect.arrayOf({ role: "sample", value: 1 }));
  expect([{ role: "received", value: 2 }]).toEqual(
    expect.arrayContaining([{ role: "sample", value: 2 }])
  );
});
