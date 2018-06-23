//
// Process the data, but do not draw it.
// Processing mutates the data.
//

const { cloneDeep } = require("lodash");

function processData(immutableData) {
  const data = cloneDeep(immutableData);

  // Accumulate cycles and instructions
  data[0].cyclesSoFar = data[0].numCPUCycles;
  data[0].instructionsSoFar = data[0].numInstructions;
  for (let i = 1; i < data.length; i++) {
    const cur = data[i];
    cur.cyclesSoFar = cur.numCPUCycles + data[i - 1].cyclesSoFar;
    cur.instructionsSoFar = cur.numInstructions + data[i - 1].instructionsSoFar;
    cur.selected = false;
  }

  // Convert cache to miss-rate data
  for (let i = 0; i < data.length; i++) {
    const cur = data[i];
    const total =
      cur.events["MEM_LOAD_RETIRED.L3_MISS"] +
      cur.events["MEM_LOAD_RETIRED.L3_HIT"];
    if (total === 0) {
      cur.events.missRate = 0;
    } else {
      cur.events.missRate = cur.events["MEM_LOAD_RETIRED.L3_MISS"] / total;
    }
    cur.selected = false;
  }

  return data;
}

module.exports = { processData };
