import {createInterface} from 'node:readline';
import {finished} from 'node:stream/promises';
import {StringDecoder} from 'node:string_decoder';
import {Worker} from 'node:worker_threads';

// Rust owns scheduling and per-file deadlines. This process only hosts fresh
// V8 isolates so files avoid paying for an entire Node process at every turn.
const workers = new Map();
const write = process.stdout.write.bind(process.stdout);
function send(testPath, type, data) {
  write(`__RJEST_HOST__${JSON.stringify({testPath, type, data})}\n`);
}

function forward(stream, testPath, type) {
  const decoder = new StringDecoder('utf8');
  stream.on('data', chunk => send(testPath, type, decoder.write(chunk)));
  stream.on('end', () => {
    const remaining = decoder.end();
    if (remaining) send(testPath, type, remaining);
  });
}

async function start(request) {
  const {testPath} = request;
  try {
    const worker = new Worker(process.argv[2], {
      workerData: request,
      stdout: true,
      stderr: true,
    });
    workers.set(testPath, worker);
    forward(worker.stdout, testPath, 'stdout');
    forward(worker.stderr, testPath, 'stderr');
    worker.on('error', error => send(testPath, 'stderr', error.stack ?? String(error)));
    const code = await new Promise(resolve => worker.once('exit', resolve));
    // Exit can precede the final readable-stream delivery. Results and live
    // events must reach Rust before it releases this file's scheduler slot.
    await Promise.all([finished(worker.stdout), finished(worker.stderr)]);
    workers.delete(testPath);
    send(testPath, 'exit', String(code));
  } catch (error) {
    send(testPath, 'stderr', error.stack ?? String(error));
    send(testPath, 'exit', '1');
  }
}

const input = createInterface({input: process.stdin, crlfDelay: Infinity});
input.on('line', line => {
  const message = JSON.parse(line);
  if (message.cancel) {
    void workers.get(message.cancel)?.terminate();
  } else {
    void start(message);
  }
});
input.on('close', () => {
  for (const worker of workers.values()) void worker.terminate();
});
