const delay = milliseconds =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

const identities = new Map();
let sequentialHookIdentity;

beforeAll(() => {
  expect(expect.getState().currentTestIdentity()).toBeUndefined();
  expect(expect.getState().currentConcurrentTestName()).toBeUndefined();
});

beforeEach(() => {
  sequentialHookIdentity = expect.getState().currentTestIdentity();
});

afterEach(() => {
  expect(expect.getState().currentTestIdentity()).toBe(
    sequentialHookIdentity,
  );
});

afterAll(() => {
  expect(expect.getState().currentTestIdentity()).toBeUndefined();
  expect(expect.getState().currentConcurrentTestName()).toBeUndefined();
});

const recordConcurrentIdentity = async label => {
  const state = expect.getState();
  const identity = state.currentTestIdentity();
  identities.set(label, identity);

  expect(identity).toBeTruthy();
  expect(state.currentConcurrentTestName()).toBe(`${label} identity`);
  await delay(15);
  expect(state.currentTestIdentity()).toBe(identity);
};

test.concurrent('first identity', () =>
  recordConcurrentIdentity('first'),
);

test('exposes one stable identity through sequential hooks and body', () => {
  const state = expect.getState();
  expect(state.currentTestIdentity()).toBe(sequentialHookIdentity);
  expect(state.currentConcurrentTestName()).toBe(
    'exposes one stable identity through sequential hooks and body',
  );
  expect(identities.size).toBe(2);
  expect(identities.get('first')).not.toBe(identities.get('second'));
});

test.concurrent('second identity', () =>
  recordConcurrentIdentity('second'),
);
