function dotProduct(as, bs) {
  const asLength = as.length;
  let sum = 0;
  for (let i = 0; i < asLength; i++) {
    sum += as[i] * bs[i];
  }
  return sum;
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
  return sigmoid(dotProduct(xis.slice(0, xis.length - 1), θs));
}

/**
 * A conditional form of cross-entropy (log-loss). Traditionally, this is done
 * through cancelling multiplication, but I suspect it could be slightly faster
 * with branch prediction.
 * https://en.wikipedia.org/wiki/Cross_entropy
 * https://ml-cheatsheet.readthedocs.io/en/latest/logistic_regression.html
 * @param {Number[][]} xs An array of number arrays; each number array contains
 *                        the values of the independent variables for one data
 *                        point.
 * @param {Number[]} ys An array containing the value of the dependent variable
 *                      for each data point.
 * @param {Number[]} θs The weights associated with each independent variable.
 */
/* function calculateCost(xs, ys, θs) {
  const xsLength = xs.length;
  let xis = [];
  let yi = 0;
  let sum = 0;
  for (let i = 0; i < xsLength; i++) {
    xis = xs[i];
    yi = ys[i];
    sum +=
      yi === 1
        ? Math.log(predictProbability(xis, θs))
        : Math.log(1 - predictProbability(xis, θs));
  }
  return sum;
} */

function stochasticGradientDescent(trainingData, learningRate, iterations) {
  const numDataPoints = trainingData.length;
  const numIndependentVariables = trainingData[0].length - 1;
  console.log(numIndependentVariables);
  /* Init the thetas; I've seen at least one claim that it can be either all 0s
  or random */
  const θs = [];
  let i = numIndependentVariables;
  while (i) {
    θs[--i] = 0;
  }

  let squaredErrorSum = 0;
  let row = [];
  let predictedY = 0;
  let error = 0;
  for (i = 0; i < iterations; i++) {
    squaredErrorSum = 0;
    for (let j = 0; j < numDataPoints; j++) {
      row = trainingData[j];
      predictedY = predictProbability(row, θs);
      error = row[numIndependentVariables] - predictedY;
      squaredErrorSum += Math.pow(error, 2);
      console.log(
        `row is ${row}, predictedY is ${predictedY}, error is ${error}, squaredErrorSum is ${squaredErrorSum}`
      );
      for (let k = 0; k < numIndependentVariables; k++) {
        θs[k] += learningRate * error * predictedY * (1 - predictedY) * row[k];
      }
    }
  }
  return θs;
}

function train(trainingData, learningRate, iterations) {
  const θs = stochasticGradientDescent(trainingData, learningRate, iterations);
  // const cost = calculateCost(xs, ys, θs);
  return θs;
}

module.exports = { train };
