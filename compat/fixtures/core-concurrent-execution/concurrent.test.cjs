const delay = milliseconds =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

describe('concurrent scheduling', () => {
  const events = [];
  let active = 0;
  let peak = 0;
  let started = 0;
  let releasePair;
  const pairStarted = new Promise(resolve => {
    releasePair = resolve;
  });

  const work = async name => {
    active += 1;
    started += 1;
    peak = Math.max(peak, active);
    events.push(`${name}:start`);
    if (started === 2) releasePair();

    await Promise.race([pairStarted, delay(100)]);
    expect(started).toBeGreaterThanOrEqual(2);
    expect(active).toBeLessThanOrEqual(2);
    expect(name).toMatchSnapshot();
    await delay(10);
    events.push(`${name}:end`);
    active -= 1;
  };

  test.concurrent('runs first', () => work('first'));

  test('runs sequential tests after the concurrent unit', () => {
    expect(events.filter(event => event.endsWith(':end'))).toHaveLength(3);
    expect(peak).toBe(2);
    expect(concurrentStartNames).toEqual([
      'runs first',
      'runs second',
      'honors maxConcurrency',
    ]);
    expect(concurrentEndNames).toEqual(concurrentStartNames);
  });

  test.concurrent('runs second', () => work('second'));
  test.concurrent('honors maxConcurrency', () => work('third'));
});

describe('concurrent hooks', () => {
  let hookCalls = 0;

  beforeEach(() => {
    hookCalls += 1;
  });
  afterEach(() => {
    hookCalls += 1;
  });

  test.concurrent('does not run per-test hooks', () => {
    expect.assertions(1);
    expect(hookCalls).toBe(0);
  });

  test('still runs per-test hooks for sequential tests', () => {
    expect(hookCalls).toBe(1);
  });
});
