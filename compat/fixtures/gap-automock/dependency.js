class Calculator {
  multiply(left, right) {
    return left * right;
  }

  static version() {
    return '1.0';
  }
}

module.exports = {
  Calculator,
  calculate(left, right) {
    return left + right;
  },
  nested: {
    label: 'stable',
    execute() {
      return 'executed';
    },
  },
  values: [1, 2, 3],
};
