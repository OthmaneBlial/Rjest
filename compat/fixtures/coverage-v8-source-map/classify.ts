function classify(value: number): string {
  if (value > 0) {
    return 'positive';
  }
  return 'not-positive';
}

module.exports = {classify};
