test('distinguishes throwing undefined from not throwing', () => {
  expect(() => {
    throw undefined;
  }).toThrow();
  expect(() => undefined).not.toThrow();
});

test('rejects unsupported expected values', () => {
  const thrower = () => {
    throw new Error('boom');
  };

  for (const invalid of [null, 42, true, Symbol('invalid')]) {
    expect(() => expect(thrower).toThrow(invalid)).toThrow(
      /expected.*string or regular expression or class or error/i,
    );
  }
});

test('supports regular-expression-like expected objects', () => {
  const messages = [];
  const matcher = {
    test(message) {
      messages.push(message);
      return message === 'boom';
    },
  };

  expect(() => {
    throw new Error('boom');
  }).toThrow(matcher);
  expect(messages).toEqual(['boom']);
});

test('compares error causes recursively', () => {
  const thrower = () => {
    throw new Error('outer', {
      cause: new Error('inner', {cause: new Error('root')}),
    });
  };

  expect(thrower).toThrow(
    new Error('outer', {
      cause: new Error('inner', {cause: new Error('root')}),
    }),
  );
  expect(thrower).not.toThrow(
    new Error('outer', {
      cause: new Error('different'),
    }),
  );
});

test('requires the constructor of a custom expected error instance', () => {
  class DomainError extends Error {}
  class OtherError extends Error {}

  const thrower = () => {
    throw new DomainError('boom');
  };

  expect(thrower).toThrow(new DomainError('boom'));
  expect(thrower).not.toThrow(new OtherError('boom'));
  expect(thrower).toThrow(new Error('boom'));
});

test('accepts plain expected objects with matching messages', () => {
  expect(() => {
    throw new Error('boom');
  }).toThrow({message: 'boom'});
});

test('uses String on non-error thrown values without string messages', () => {
  const thrown = {message: 42};
  expect(() => {
    throw thrown;
  }).not.toThrow('42');
  expect(() => {
    throw thrown;
  }).toThrow('[object Object]');
});

test('passes the original thrown value to asymmetric matchers', () => {
  const thrown = {code: 'E_RJEST', message: 'boom'};
  expect(() => {
    throw thrown;
  }).toThrow(expect.objectContaining({code: 'E_RJEST'}));
});
