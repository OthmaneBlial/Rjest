type Calculator = {
  add(left: number, right: number): number;
};

const calculator: Calculator = {
  add: (left, right) => left + right,
};

describe('TypeScript', () => {
  test('strips types while preserving runtime semantics', () => {
    const typed: Calculator = calculator;
    expect(typed.add(20, 22)).toBe(42);
  });
});
