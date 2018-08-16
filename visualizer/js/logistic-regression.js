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
 * @param {Number[]} row An array of all data associated with this data point.
 * @param {Number[]} θs The weights associated with each independent variable.
 * @returns The Y (i.e selected status) we'd expect given these
 *          independent variables and weights. I think.
 */
function predictY(row, θs) {
  return sigmoid(dotProduct(row.slice(0, row.length - 1), θs));
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
 * @returns The cost, which we're trying to reduce over time.
 */
function calculateCost(trainingData, θs) {
  const numDataPoints = trainingData.length;
  const numIndependentVariables = trainingData[0].length - 1;
  let sum = 0;
  for (let i = 0; i < numDataPoints; i++) {
    const row = trainingData[i];
    const yi = row[numIndependentVariables];
    sum +=
      yi === 1 ? Math.log(predictY(row, θs)) : Math.log(1 - predictY(row, θs));
  }
  return sum;
}

/**
 * Implementation of stochastic gradient descent, a variation of batch gradient
 * descent. Instead of iterating through all of the data, it calculates the
 * result for only a few single data points.
 * Reference implementation: https://machinelearningmastery.com/implement-logistic-regression-stochastic-gradient-descent-scratch-python/
 * Possible improvements: http://ruder.io/optimizing-gradient-descent/
 * @param {Object[]} trainingData All of the data
 * @param {Number} learningRate How big of "steps" we want to take to the
 *                              solution. If the step is too big, we may miss
 *                              the optimal minimum. If the step is too small,
 *                              we may take forever to get there. 0.3 has been
 *                              working well.
 * @param {Number} iterations How many times we want to run through the data.
 *                            We'd like this to be as short as possible, but we
 *                            also want enough iterations to be reasonably
 *                            accurate.
 * @returns An array of weights per function, which we can convert to
 *          probability.
 */
function stochasticGradientDescent(trainingData, learningRate, iterations) {
  const numDataPoints = trainingData.length;
  const numIndependentVariables = trainingData[0].length - 1;
  /* Init the thetas; I chose all 0s, but I've read it doesn't really matter */
  const θs = [];
  let i = numIndependentVariables;
  while (i) {
    θs[--i] = 0;
  }

  let row = [];
  let predictedY = 0;
  let error = 0;
  for (i = 0; i < iterations; i++) {
    shuffle(trainingData); // Required each iteration.
    /* The sum of squared errors is useful; you can use it to see the reduction
    of error after each iteration. When you start getting diminishing returns,
    you want to tune the learning rate and iteration count. */
    // let squaredErrorSum = 0;
    for (let j = 0; j < numDataPoints; j++) {
      row = trainingData[j];
      predictedY = predictY(row, θs);
      error = row[numIndependentVariables] - predictedY;
      // squaredErrorSum += Math.pow(error, 2);
      for (let k = 0; k < numIndependentVariables; k++) {
        θs[k] += learningRate * error * predictedY * (1 - predictedY) * row[k];
      }
    }
    // console.log(`iter=${iterations}, error=${squaredErrorSum}`);
  }
  return θs;
}

function train(trainingData, learningRate, iterations) {
  const θs = stochasticGradientDescent(trainingData, learningRate, iterations);
  const cost = calculateCost(trainingData, θs);
  return { cost, θs };
}
/**
 * Performs the Durstenfeld optimization of Fisher-Yates.
 * Taken from https://stackoverflow.com/a/12646864
 * @param {[]} array The array to be shuffled in place.
 */
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

module.exports = { train };
