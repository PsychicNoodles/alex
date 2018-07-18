const fisher = require("fishertest");
/**
 * Run analyses of data.
 * @param timeSlices All the data.
 * @param {(stackFrames: Array) => string} getFunctionName
 *    Get a unique name for a function. All timeslices that resolve to the same
 *    function name will be grouped together.
 * @returns Results of the analysis.
 * @todo Move out the partitioning from subfunctions into this function.
 * @todo Let client choose sort?
 */
function analyze(timeSlices, getFunctionName) {
  const outputData = {
    selectedTotal: 0,
    unselectedTotal: 0,
    functions: []
  };

  const functionsMap = new Map();
  for (const timeSlice of timeSlices) {
    const functionName = getFunctionName(timeSlice.stackFrames);
    if (!functionsMap.has(functionName)) {
      functionsMap.set(functionName, {
        name: functionName,
        time: 0,
        observed: 0,
        unselectedCount: 0,
        expected: 0,
        probability: 0
      });
    }

    const functionEntry = functionsMap.get(functionName);
    if (timeSlice.selected) {
      outputData.selectedTotal++;
      functionEntry.time += timeSlice.numCPUTimerTicks;
      functionEntry.observed++;
    } else {
      outputData.unselectedTotal++;
      functionEntry.unselectedCount++;
    }
  }

  outputData.functions = [...functionsMap.values()];

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

module.exports = { analyze };
