function classify(value) {
  if (value > 0) {
    return 'positive';
  }
  return 'not-positive';
}

function untouched() {
  return 'untouched';
}

module.exports = {classify, untouched};
