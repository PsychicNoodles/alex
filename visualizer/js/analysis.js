const chi = require("chi-squared");

module.exports = chiSquaredTest;

/**
 * Conducts a chi-squared test on the given data, intended to determine whether
 * the functions found in the selected region are independent of their selected
 * state (i.e. selected data ISN'T special) or dependent on their selected state
 * (i.e. selected data IS special). Intended null hypothesis: Each datapoint's
 * associated function is independent of the datapoint's selected state.
 *
 * @param data All data collected by the collector
 * @returns {number} The chi-squared probability, in percent
 * @todo Change return -1 to something more sensible.
 * @todo Test if a single loop with many "=== undefined" is actually
 * faster than two loops that initialize the array and then compute the function
 * tallies.
 * @todo Convert forEach calls into for loops when need for performance
 * outweighs need for readability.
 * @todo: Force the two variables to be specified by the client.
 */
function chiSquaredTest(data) {
  /* "Associative arrays", containing counts of function appearances within a
    region. Key = function name. Value = function count. */
  const selected = [];
  let selectedTotal = 0;
  const unselected = [];
  let unselectedTotal = 0;
  const total = data.length;

  /* Normal array, containing one of each function collected. */
  const uniqueFunctions = [];

  /* Populate a "table" with function counts for unselected/selected */
  let functionName;
  data.forEach(datum => {
    functionName = datum.stackFrames[0].name;
    /* "Initialize" the associative arrays at this datapoint's function, if this
    hasn't already been done. */
    if (selected[functionName] === undefined) {
      selected[functionName] = 0;
    }
    if (unselected[functionName] === undefined) {
      unselected[functionName] = 0;
    }

    /* Add 1 to the number of times this datum's associated function
    appeared in the selected (or unselected) region. */
    if (datum.selected) {
      selected[functionName]++;
      selectedTotal++;
    } else {
      unselected[functionName]++;
      unselectedTotal++;
    }

    // If we haven't encountered this function before, add it to our list
    if (!uniqueFunctions.includes(functionName)) {
      uniqueFunctions.push(functionName);
    }
  });

  // (number of columns - 1)(number of rows - 1) simplifies to this
  const degreesOfFreedom = uniqueFunctions.length - 1;

  // Checks to avoid situations without two comparable groups.
  if (selectedTotal === 0) {
    console.error("Chi-squared test called with no selected data.");
    return -1;
  } else if (unselectedTotal === 0) {
    console.error("Chi-squared test called with all data selected.");
    return -1;
  }

  let chiSquared = 0;
  let observed;
  let expected;
  uniqueFunctions.forEach(uniqueFunction => {
    // Compute chi-squared through the "row" representing selected state
    observed = selected[uniqueFunction];
    expected =
      ((selected[uniqueFunction] + unselected[uniqueFunction]) *
        selectedTotal) /
      total;
    // console.log(`Saw ${observed} of ${uniqueFunction}, expected ~${Math.round(expected)}`);
    chiSquared += Math.pow(observed - expected, 2) / expected;

    // Compute chi-squared sum through the "row" representing unselected state
    observed = unselected[uniqueFunction];
    expected =
      ((unselected[uniqueFunction] + selected[uniqueFunction]) *
        unselectedTotal) /
      total;
    chiSquared += Math.pow(observed - expected, 2) / expected;
  });

  // Compute the probability
  return chi.cdf(chiSquared, degreesOfFreedom);
}
