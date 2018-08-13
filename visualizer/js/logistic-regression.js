/**
 * @todo Possibly faster with a for loop.
 */
function dotProduct(as, bs) {
  return as.map((a, i) => a * bs[i]).reduce((m, n) => m + n);
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Map the independent variable values of a certain data point to a value on the
 * log probability scale. AKA "h(x)".
 * @param {Number[]} xis An array of independent variable values for one data
 *                       point.
 * @param {Number[]} θs The weights associated with each independent variable.
 */
function predictProbability(xis, θs) {
  return sigmoid(dotProduct(xis, θs));
}

/**
 * A no-conditional form of cross-entropy (log-loss). When yis === 0, the
 * equation is -log(h(xis, θs)); when it's 1, the equation is
 * -log(1 - h(xis, θs)). The multiplying terms yis and 1 - yis conveniently
 * cancel out whichever side is not applicable.
 * https://en.wikipedia.org/wiki/Cross_entropy
 * https://ml-cheatsheet.readthedocs.io/en/latest/logistic_regression.html
 * @param {Number[][]} xs An array of number arrays; each number array contains
 *                        the values of the independent variables for one data
 *                        point.
 * @param {Number[]} ys An array containing the value of the dependent variable
 *                      for each data point.
 * @param {Number[]} θs The weights associated with each independent variable.
 * @todo Could be faster with a conditional due to branch prediction, slowness
 *       of multiplication, etc. Also probably faster with a for loop.
 */
function calculateCost(xs, ys, θs) {
  let yi = 0;
  return (
    -xs
      .map((xis, i) => {
        yi = ys[i];
        return (
          yi * Math.log(predictProbability(xis, θs)) +
          (1 - yi) * Math.log(1 - predictProbability(xis, θs))
        );
      })
      .reduce((m, n) => m + n) / xs.length
  );
}

/* function gradientDescent(xs, ys, θs, learningRate) {
  const numDataPoints = xs.length;
  const numIndependent = xs[0].length;
  let θ = 0;
  const updatedθs = [].fill.call({ length: xs[0].length + 1 }, 0);
  for (let i = 0; i < numIndependent; i++) {}
  xs.map(xi => {});
}

function train(xs, ys, θs, learningRate, iterations) {
  let updatedθs = [];
  for (let i = 0; i < iterations; i++) {
    updatedθs = gradientDescent(xs, ys, θs, learningRate);
  }
  const cost = calculateCost(xs, ys, updatedθs);
  return { cost, updatedθs };
} */
