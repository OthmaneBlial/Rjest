const {existsSync} = require('node:fs');
const {join} = require('node:path');

process.stdout.write('application output without a newline');

async function waitForReporterMarker(name) {
  const marker = join(__dirname, name);
  const deadline = Date.now() + 2_000;
  while (!existsSync(marker) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  expect(existsSync(marker)).toBe(true);
}

test('first', async () => {
  await waitForReporterMarker('first.started');
});

test('second', async () => {
  await waitForReporterMarker('first.completed');
  await waitForReporterMarker('second.started');
});

test.skip('skipped', () => {
  throw new Error('a skipped test must not execute');
});

test.todo('todo');
