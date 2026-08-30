const { appendFileSync } = require("node:fs");

test("runs a", () => {
  appendFileSync("sequence.marker", "a");
  expect(true).toBe(true);
});
