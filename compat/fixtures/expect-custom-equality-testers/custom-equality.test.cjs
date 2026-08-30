class Quantity {
  constructor(value, unit) {
    this.value = value;
    this.unit = unit;
  }
}

class Basket {
  constructor(label, quantities, internalId) {
    this.label = label;
    this.quantities = quantities;
    this.internalId = internalId;
  }
}

function quantitiesEqual(left, right) {
  const leftIsQuantity = left instanceof Quantity;
  const rightIsQuantity = right instanceof Quantity;
  if (leftIsQuantity && rightIsQuantity) {
    const inMilliliters = quantity =>
      quantity.unit === 'L' ? quantity.value * 1000 : quantity.value;
    return inMilliliters(left) === inMilliliters(right);
  }
  return leftIsQuantity === rightIsQuantity ? undefined : false;
}

function basketsEqual(left, right, customTesters) {
  const leftIsBasket = left instanceof Basket;
  const rightIsBasket = right instanceof Basket;
  if (leftIsBasket && rightIsBasket) {
    return (
      left.label === right.label &&
      this.equals(left.quantities, right.quantities, customTesters)
    );
  }
  return leftIsBasket === rightIsBasket ? undefined : false;
}

expect.addEqualityTesters([quantitiesEqual, basketsEqual]);

test('applies recursive equality testers across Jest matchers', () => {
  const liters = new Basket('water', [new Quantity(1, 'L')], 1);
  const milliliters = new Basket('water', [new Quantity(1000, 'mL')], 99);
  const mock = jest.fn();
  mock(liters);

  expect(liters).toEqual(milliliters);
  expect([liters]).toContainEqual(milliliters);
  expect(new Map([['basket', liters]])).toEqual(
    new Map([['basket', milliliters]]),
  );
  expect(mock).toHaveBeenCalledWith(milliliters);
  expect(liters).not.toBe(milliliters);
});
