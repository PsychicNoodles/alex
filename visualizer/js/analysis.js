const chi = require("chi-squared");

/**
 * Run analyses of data.
 * @param timeSlices All the data.
 * @returns Results of the analysis.
 * @todo Move out the partitioning from subfunctions into this function.
 * @todo Let client choose sort?
 */
function analyze(timeSlices) {
  const outputData = {
    selectedTotal: 0,
    unselectedTotal: 0,
    timeSliceTotal: 0,
    functions: []
  };

  let functionName = "";
  let functionIndex = -1;
  timeSlices.forEach(timeSlice => {
    functionName = getCallStackName(timeSlice.stackFrames);
    functionIndex = outputData.functions.findIndex(
      element => element.name === functionName
    );
    if (functionIndex === -1) {
      functionIndex = outputData.functions.push({ name: functionName }) - 1;
    }
    if (timeSlice.selected) {
      outputData.selectedTotal++;
      outputData.functions[functionIndex].time =
        (outputData.functions[functionIndex].time || 0) +
        timeSlice.numCPUTimerTicks;
      outputData.functions[functionIndex].observed =
        (outputData.functions[functionIndex].observed || 0) + 1;
    } else {
      outputData.unselectedTotal++;
      outputData.functions[functionIndex].unselectedCount =
        (outputData.functions[functionIndex].unselectedCount || 0) + 1;
    }
  });
  outputData.timeSliceTotal = timeSlices.length;

  if (
    outputData.selectedTotal === 0 ||
    outputData.unselectedTotal === 0 ||
    outputData.timeSliceTotal === 1
  ) {
    return outputData;
  }

  // We have a 2x2 chi-squared table. (rows - 1) * (columns - 1) = 1.
  const degreesOfFreedom = 1;

  /* Chi-Squared Table variable names
   *            | Current Function     | Other Functions   | Total (outputData)
   * Selected   | func.observed        | notFuncSelected   | .selectedTotal
   * Unselected | func.unselectedCount | notFuncUnselected | .unselectedTotal
   * Total      | funcTotal            | notFuncTotal      | .timeSliceTotal
   */
  for (const func in outputData.functions) {
    const funcTotal = func.observed + func.unselectedCount;
    const notFuncSelected = outputData.selectedTotal - func.observed;
    const notFuncUnselected = (outputData.unselectedTotal =
      func.unselectedCount);
    const notFuncTotal = outputData.timeSliceTotal - funcTotal;

    // Square one: selected data containing this function
    func.expected =
      (funcTotal * outputData.selectedTotal) / outputData.timeSliceTotal;
    let squaredDeviance =
      Math.pow(func.observed - func.expected, 2) / func.expected;
    let chiSquared = squaredDeviance;

    // Square two: selected data NOT containing this function
    let observed = notFuncSelected;
    let expected =
      (notFuncTotal * outputData.selectedTotal) / outputData.timeSliceTotal;
    squaredDeviance = Math.pow(observed - expected, 2) / expected;
    chiSquared += squaredDeviance;

    // Square three: unselected data containing this function
    observed = func.unselectedCount;
    expected =
      (funcTotal * outputData.unselectedTotal) / outputData.timeSliceTotal;
    squaredDeviance = Math.pow(observed - expected, 2) / expected;
    chiSquared += squaredDeviance;

    // Square four: unselected data NOT containing this function
    observed = notFuncUnselected;
    expected =
      (notFuncTotal * outputData.unselectedTotal) / outputData.timeSliceTotal;
    squaredDeviance = Math.pow(observed - expected, 2) / expected;
    chiSquared += squaredDeviance;

    console.log(
      `Saw ${func.observed} of ${func.name}, expected ~${Math.round(expected)}`
    );

    func.probability = chi.cdf(chiSquared, degreesOfFreedom);
  }

  outputData.functions.sort((a, b) => b.probability - a.probability);
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
 * @param timeSlices All data collected by the collector
 * @param outputData Mutable reference to the output data.
 * @todo Consider changes for performance: conversion of forEach loops,
 * different ways of accessing the "associative arrays" or converting them into
 * true arrays of pair-ish objects, using one loop to initialize
 * selected/unselected instead of "checking === undefined" every "loop"
 */

module.exports = { analyze };
