const delay = milliseconds =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

test.each`
  left | right | expected | meta
  ${1} | ${2} | ${3} | ${{label: 'small'}}
  ${20} | ${22} | ${42} | ${{label: 'answer'}}
`('$left + $right = $expected [$meta.label] row $#', row => {
  expect(row.left + row.right).toBe(row.expected);
  expect(row.meta.label).toMatch(/small|answer/);
});

describe.each`
  label | value
  ${'alpha'} | ${2}
  ${'beta'} | ${4}
`('$label suite row $#', row => {
  test('receives the named row object', () => {
    expect(row.value).toBe(row.label === 'alpha' ? 2 : 4);
  });
});

let active = 0;
let peak = 0;
let started = 0;
let releasePair;
const pairStarted = new Promise(resolve => {
  releasePair = resolve;
});

test.concurrent.each`
  label | value
  ${'first'} | ${1}
  ${'second'} | ${2}
`('concurrent $label row $#', async row => {
  active += 1;
  started += 1;
  peak = Math.max(peak, active);
  if (started === 2) releasePair();
  await Promise.race([pairStarted, delay(100)]);
  expect(row.value).toBe(row.label === 'first' ? 1 : 2);
  active -= 1;
});

test('tagged concurrent rows overlap', () => {
  expect(peak).toBe(2);
});
