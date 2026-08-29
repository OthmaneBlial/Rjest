const {Worker} = require('node:worker_threads');

test('eval workers do not inherit runner-only module mode', async () => {
  const value = await new Promise((resolve, reject) => {
    const worker = new Worker(
      `
        const {parentPort} = require('node:worker_threads');
        parentPort.postMessage(42);
      `,
      {eval: true},
    );
    worker.once('message', resolve);
    worker.once('error', reject);
  });

  expect(value).toBe(42);
});
