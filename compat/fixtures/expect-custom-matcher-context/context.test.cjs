expect.extend({
  toUseJestMatcherContext(received, expected) {
    const pass = this.equals(
      received,
      expected,
      [...this.customTesters, this.utils.iterableEquality],
      true,
    );
    const utilitiesAreUsable = [
      this.utils.EXPECTED_COLOR('expected'),
      this.utils.RECEIVED_COLOR('received'),
      this.utils.diff({value: 1}, {value: 2}),
      this.utils.printDiffOrStringify(
        {value: 1},
        {value: 2},
        'Expected',
        'Received',
        true,
      ),
      this.utils.matcherHint('toUseJestMatcherContext'),
      this.utils.printExpected(expected),
      this.utils.printReceived(received),
    ].every(value => typeof value === 'string' && value.length > 0);

    return {
      pass: pass && utilitiesAreUsable,
      message: () => 'expected the Jest matcher context utilities to work',
    };
  },
});

test('provides equality, iterable, color, and diff matcher utilities', () => {
  expect([{value: 1}, {value: 2}]).toUseJestMatcherContext([
    {value: 1},
    {value: 2},
  ]);
});
