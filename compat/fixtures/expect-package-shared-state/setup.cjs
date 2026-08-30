const {expect: packageExpect} = require('expect');

packageExpect.extend({
  toBeFortyTwo(received) {
    return {
      message: () => `expected ${received} to be 42`,
      pass: received === 42,
    };
  },
});
