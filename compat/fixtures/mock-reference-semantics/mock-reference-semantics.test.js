class Monitor {
  read(value) {
    return `original:${value}`;
  }
}

afterEach(() => {
  jest.restoreAllMocks();
});

test('repeated spies reuse their implementation queue and restore cleanly', () => {
  const first = jest
    .spyOn(Monitor.prototype, 'read')
    .mockImplementationOnce(value => `first:${value}`)
    .mockImplementationOnce(value => `second:${value}`);
  const second = jest.spyOn(Monitor.prototype, 'read');
  const monitor = new Monitor();

  expect(second).toBe(first);
  expect(monitor.read('a')).toBe('first:a');
  expect(monitor.read('b')).toBe('second:b');
  expect(monitor.read('c')).toBe('original:c');
  expect(first.mock.results.map(result => result.type)).toEqual([
    'return',
    'return',
    'return',
  ]);
});

test('restored prototype methods can be spied on again in the next test', () => {
  const spy = jest.spyOn(Monitor.prototype, 'read');
  expect(new Monitor().read('fresh')).toBe('original:fresh');
  expect(spy).toHaveBeenCalledTimes(1);
});

test('mock metadata preserves arity, contexts, instances, and recursion results', () => {
  const context = {name: 'receiver'};
  const add = jest.fn((left, right) => left + right);
  expect(add.length).toBe(2);
  expect(add.call(context, 2, 3)).toBe(5);
  expect(add.mock.contexts[0]).toBe(context);
  expect(add.mock.instances[0]).toBe(context);

  const target = {
    recurse(depth) {
      return depth === 0 ? 'done' : target.recurse(depth - 1);
    },
  };
  const recursive = jest.spyOn(target, 'recurse');
  expect(target.recurse(3)).toBe('done');
  expect(recursive.mock.results).toEqual([
    {type: 'return', value: 'done'},
    {type: 'return', value: 'done'},
    {type: 'return', value: 'done'},
    {type: 'return', value: 'done'},
  ]);

  const Constructor = jest.fn(function Constructor(value) {
    this.value = value;
  });
  const instance = new Constructor('created');
  expect(instance).toBeInstanceOf(Constructor);
  expect(Constructor.mock.instances).toEqual([instance]);
  expect(Constructor.mock.contexts).toEqual([instance]);
  expect(instance.value).toBe('created');
});

test('an undefined one-shot implementation falls back to the default', () => {
  const mock = jest.fn(() => 'default').mockImplementationOnce(undefined);
  expect(mock()).toBe('default');
});
