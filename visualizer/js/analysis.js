const fisher = require("fishertest");
/**
 * Run analyses of data.
 * Fisher's exact test null hypothesis: the given function and other functions
 * are equally likely to be in the selection region.
 * @param timeSlices All the data.
 * @param {(stackFrames: Array) => string} getFunctionName
 *    Get a unique name for a function. All timeslices that resolve to the same
 *    function name will be grouped together.
 * @returns Results of the analysis.
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

  if (outputData.selectedTotal !== 0 && outputData.unselectedTotal !== 0) {
    outputData.functions.forEach(cur => {
      const funcTotal = cur.observed + cur.unselectedCount;
      cur.expected = (funcTotal * outputData.selectedTotal) / timeSlices.length;

      const otherObserved = outputData.selectedTotal - cur.observed;
      const otherUnselectedCount =
        outputData.unselectedTotal - cur.unselectedCount;
      cur.probability =
        1 -
        fisher(
          cur.observed,
          otherObserved,
          cur.unselectedCount,
          otherUnselectedCount
        );
      /* console.log(`1A: ${cur.observed}, 1B: ${otherObserved}`);
      console.log(`2A: ${cur.unselectedCount}, 2B: ${otherUnselectedCount}`); */

      /* console.log(
        `Saw ${cur.observed} of ${cur.name}, expected ~${Math.round(
          cur.expected
        )}, probability ${cur.probability}`
      ); */
    });
  }

  outputData.functions.sort((a, b) => {
    const sort1 = b.probability - a.probability;
    const sort2 = b.observed - a.observed;
    const sort3 = b.time - a.time;
    if (sort1 !== 0) {
      return sort1;
    } else if (sort2 !== 0) {
      return sort2;
    } else {
      return sort3;
    }
  });
  return outputData;
}

module.exports = { analyze };
