const fisher = require("fishertest");
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

  if (outputData.selectedTotal === 0 || outputData.unselectedTotal === 0) {
    return outputData;
  }

  /* Chi-Squared Table variable names
   *            | Current Function     | Other Functions
   * ---------------------------------------------------
   * Selected   | func.observed        | notFuncSelected
   * ---------------------------------------------------
   * Unselected | func.unselectedCount | notFuncUnselected
   */
  outputData.functions.forEach(func => {
    const notFuncSelected = outputData.selectedTotal - func.observed;
    const notFuncUnselected = outputData.unselectedTotal - func.unselectedCount;
    func.probability =
      1 -
      fisher(
        func.observed,
        notFuncSelected,
        func.unselectedCount,
        notFuncUnselected
      );
    /* console.log(`1A: ${func.observed}, 1B: ${notFuncSelected}`);
    console.log(`2A: ${func.unselectedCount}, 2B: ${notFuncUnselected}`); */
    const funcTotal = func.observed + func.unselectedCount;
    func.expected = (funcTotal * outputData.selectedTotal) / timeSlices.length;

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
