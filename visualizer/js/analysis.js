const { partition } = require("lodash");

module.exports = chiSquaredTest;

/**
 * Conducts a chi-squared test on the given data, intended to determine whether
 * the functions found in the selected region are independent of their location
 * (i.e. selected data ISN'T special) or dependent on their location (i.e.
 * selected data IS special). Intended null hypothesis: Each datapoint's
 * associated function is independent of the datapoint's selected state.
 *
 * @param data All data collected by the collector
 * @returns {number} The chi-squared value
 * @todo Change return -1 to something more sensible.
 * @todo Determine if the first "else" branch is entered when no data has been
 * assigned a value for selected.
 * @todo: Figure out how to determine if the chi-squared value is grounds for
 * rejecting the null hypothesis.
 * @todo Convert forEach calls into for loops when need for performance
 * outweighs need for readability.
 */
function chiSquaredTest(data) {
  /* "Associative arrays", containing counts of function appearances within a
    region. Key = function name. Value = function count. */
  const selected = [];
  const unselected = [];

  /* Normal array, containing one of each function collected. We need this
    because we are summing over each function. (At least, I'm pretty sure.) */
  const uniqueFunctions = [];

  data.forEach(datum => {
    if (datum.selected) {
      /* Add 1 to the number of times this datum's associated function
            appeared in the selected region. */
      selected[datum.function]++;
      selected.total++;
    } else {
      // Ditto above, but for unselected region.
      unselected[datum.function]++;
      unselected.total++;
    }

    // If we haven't encountered this function before, add it to our list
    if (!uniqueFunctions.includes(datum.function)) {
      uniqueFunctions.push(datum.function);
    }
  });

  // We need these checks to avoid divide-by-zero errors.
  if (selected.total === 0) {
    console.error("Chi-squared test called with no selected data.");
    return -1;
  } else if (unselected.total === 0) {
    console.error("Chi-squared test called with all data selected.");
    return -1;
  }

  let chiSquared = 0;
  let observed;
  let expected;
  uniqueFunctions.forEach(uniqueFunction => {
    observed = selected[uniqueFunction] / selected.total;
    expected = unselected[uniqueFunction] / unselected.total;
    // Avoid divide-by-zero
    if (expected === 0) {
      return; // Only exits this iteration of the "loop".
    }
    chiSquared += Math.pow(observed - expected, 2) / expected;
  });
  return chiSquared;
}
