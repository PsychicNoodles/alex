const chi = require("chi-squared");

/**
 * Run analyses of data.
 * @param inputData All the data.
 * @returns Results of the analysis.
 * @todo Move out the partitioning from subfunctions into this function.
 * @todo Let client choose sort?
 */
function analyze(inputData) {
  const functionRuntimesMap = {};
  inputData.forEach(timeslice => {
    if (timeslice.selected) {
      const functionName = getCallStackName(timeslice.stackFrames);
      functionRuntimesMap[functionName] =
        (functionRuntimesMap[functionName] || 0) + timeslice.numCPUTimerTicks;
    }
  });

  const functionList = Object.keys(functionRuntimesMap).map(functionName => ({
    name: functionName,
    time: functionRuntimesMap[functionName],
    expected: 0,
    observed: 0,
    squaredDeviance: 0
  }));

  const outputData = {
    chiSquaredProbability: 0,
    functionList
  };

  chiSquared(inputData, outputData);

  outputData.functionList.sort((a, b) => b.squaredDeviance - a.squaredDeviance);
  return outputData;
}

function getCallStackName(stackFrames) {
  return stackFrames
    .map(frame => frame.symName)
    .reverse()
    .join(" > ");
}

/**
 * Conducts a chi-squared test on the given data, intended to determine whether
 * the functions found in the selected region are independent of their selected
 * state (i.e. selected data ISN'T special) or dependent on their selected state
 * (i.e. selected data IS special). Intended null hypothesis: Each datapoint's
 * associated function is independent of the datapoint's selected state.
 *
 * @param inputData All data collected by the collector
 * @param outputData Mutable reference to the output data.
 * @todo Consider changes for performance: conversion of forEach loops,
 * different ways of accessing the "associative arrays" or converting them into
 * true arrays of pair-ish objects, using one loop to initialize
 * selected/unselected instead of "checking === undefined" every "loop"
 */
function chiSquared(inputData, outputData) {
  /* "Associative arrays", containing counts of function appearances within a
    region. Key = function name. Value = function count. */

  const selected = {};

  let selectedTotal = 0;
  const unselected = {};
  let unselectedTotal = 0;
  const total = inputData.length;

  /* Normal array, containing one of each function collected. */
  const uniqueFunctions = [];

  /* Populate a "table" with function counts for unselected/selected */
  inputData.forEach(timeslice => {
    const functionName = getCallStackName(timeslice.stackFrames);

    //functionName = datum.stackFrames[0].symName;
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
    if (timeslice.selected) {
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

  // Checks to avoid situations without two comparable groups.
  if (selectedTotal === 0) {
    console.error("Chi-squared test called with no selected data.");
    return -1;
  } else if (unselectedTotal === 0) {
    console.error("Chi-squared test called with all data selected.");
    return -1;
  } else if (uniqueFunctions.length === 1) {
    console.error("Only one function was found within the data.");
    return -1;
  }

  // (number of columns - 1)(number of rows - 1) simplifies to this
  const degreesOfFreedom = uniqueFunctions.length - 1;

  let chiSquared = 0;
  uniqueFunctions.forEach(uniqueFunction => {
    // Compute chi-squared through the "row" representing selected state
    let observed = selected[uniqueFunction];
    let expected =
      ((selected[uniqueFunction] + unselected[uniqueFunction]) *
        selectedTotal) /
      total;
    const squaredDeviance = Math.pow(observed - expected, 2) / expected;
    chiSquared += squaredDeviance;

    /* Add *only* data on selected functions to the output list */
    const index = outputData.functionList.findIndex(
      element => element.name === uniqueFunction
    );
    if (index !== -1) {
      outputData.functionList[index].expected = expected;
      outputData.functionList[index].observed = observed;
      outputData.functionList[index].squaredDeviance = squaredDeviance;
    }
    /* console.log(
      `Saw ${observed} of ${uniqueFunction}, expected ~${Math.round(
        expected
      )}, chiSquared of ${squaredDeviance}`
    ); */

    /* Compute chi-squared sum through the "row" representing unselected state
    (required only for calculating overall probability) */
    observed = unselected[uniqueFunction];
    expected =
      ((unselected[uniqueFunction] + selected[uniqueFunction]) *
        unselectedTotal) /
      total;
    chiSquared += Math.pow(observed - expected, 2) / expected;
  });

  const probability = chi.cdf(chiSquared, degreesOfFreedom);
  outputData.chiSquaredProbability = probability;
}

module.exports = { analyze };
