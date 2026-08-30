function partial(value) {
  if (value) return 'covered';
  return 'uncovered';
}

function neverCalled() {
  return 'still uncovered';
}

module.exports = {neverCalled, partial};
