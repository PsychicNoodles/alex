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
      functionIndex =
        outputData.functions.push({
          name: functionName,
          time: 0,
          observed: 0,
          unselectedCount: 0,
          expected: 0,
          probability: 0
        }) - 1;
    }
    if (timeSlice.selected) {
      outputData.selectedTotal++;
      outputData.functions[functionIndex].time += timeSlice.numCPUTimerTicks;
      outputData.functions[functionIndex].observed++;
    } else {
      outputData.unselectedTotal++;
      outputData.functions[functionIndex].unselectedCount++;
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
  outputData.functions.forEach(func => {
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

    /* console.log(`1A ${func.observed}, 1B: ${notFuncSelected}`);
    console.log(`2A ${func.unselectedCount}, 2B: ${notFuncUnselected}`); */
    func.probability = chi.cdf(chiSquared, degreesOfFreedom);

    /* console.log(
      `Saw ${func.observed} of ${func.name}, expected ~${Math.round(
        func.expected
      )}, probability ${func.probability}`
    ); */
  });

  outputData.functions.sort((a, b) => b.probability - a.probability);
  return outputData;
}

function getCallStackName(stackFrames) {
  return stackFrames
    .map(frame => frame.symName)
    .reverse()
    .join(" > ");
}

module.exports = { analyze };
