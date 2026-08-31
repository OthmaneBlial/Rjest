globalThis.cliAfterEnvValue = 'framework-ready';

expect.extend({
  toBeCliReady(received) {
    return {
      pass: received === globalThis.cliAfterEnvValue,
      message: () => `expected ${String(received)} to equal the CLI setup value`,
    };
  },
});
