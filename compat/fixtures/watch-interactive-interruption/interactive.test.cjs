const fs = require('node:fs');

const state = fs.readFileSync(process.env.RJEST_INTERACTIVE_STATE, 'utf8').trim();

test('interrupts an active run before rerunning interactively', async () => {
  if (state === 'slow') {
    fs.writeFileSync(process.env.RJEST_INTERACTIVE_STARTED, 'started');
    await new Promise(() => {});
  }
  fs.appendFileSync(
    process.env.RJEST_INTERACTIVE_RESULTS,
    `${JSON.stringify({state})}\n`,
  );
  expect(state).toBe('ready');
});
