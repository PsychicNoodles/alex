/**
 * https://en.wikipedia.org/wiki/Dot_productct
 * @todo Possibly faster with a for loop.
 */
function dotProduct(a, b) {
  return a.map((x, i) => a[i] * b[i]).reduce((m, n) => m + n);
}

/**
 * https://en.wikipedia.org/wiki/Sigmoid_function
 */
function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Map the independent variable values of a certain data point to a value on the
 * log probability scale (I think). AKA "h(x)".
 * https://ml-cheatsheet.readthedocs.io/en/latest/logistic_regression.html
 * @param {Number[]} xis An array of independent variable values for one data
 *                       point.
 * @param {Number[]} θs The weights associated with each independent variable.
 */
function predict(xis, θs) {
  return sigmoid(dotProduct(xis, θs));
}

/**
 * A no-conditional form of cross-entropy (log-loss). When yis === 0, the
 * equation is -log(h(xis, θs)); when it's 1, the equation is
 * -log(1 - h(xis, θs)). The multiplying terms yis and 1 - yis conveniently
 * cancel out whichever side is not applicable.
 * https://en.wikipedia.org/wiki/Cross_entropy
 * @param {Number[][]} xs An array of number arrays; each number array contains
 *                        the values of the independent variables for one data
 *                        point.
 * @param {Number[]} ys An array containing the value of the dependent variable
 *                      for each data point.
 * @param {Number[]} θs The weights associated with each independent variable.
 * @todo Could be faster with a conditional due to branch prediction, slowness
 *       of multiplication, etc. Also probably faster with a for loop.
 */
function cost(xs, ys, θs) {
  return (
    -xs
      .map((x, i) => {
        const xis = xs[i];
        const yi = ys[i];
        return (
          yi * Math.log(predict(xis, θs)) +
          (1 - yi) * Math.log(1 - predict(xis, θs))
        );
      })
      .reduce((m, n) => m + n) / xs.length
  );
}

// function gradientDescent(xs, ys, θs, learningRate) {}

//function train(data) {

//}
