//
// Process the data, but do not draw it.
// Processing mutates the data.
//

const { cloneDeep } = require("lodash");

function processData(immutableData) {
  const data = cloneDeep(immutableData);

  const initialCPUTime = data[0].cpuTime;
  for (const timeslice of data) {
    // Remove the initial offset from CPU time
    timeslice.cpuTime -= initialCPUTime;

    // Deselect all
    timeslice.selected = false;

    // Convert cache to miss-rate data
    const total =
      timeslice.events["MEM_LOAD_RETIRED.L3_MISS"] +
      timeslice.events["MEM_LOAD_RETIRED.L3_HIT"];
    if (total === 0) {
      timeslice.events.missRate = 0;
    } else {
      timeslice.events.missRate =
        timeslice.events["MEM_LOAD_RETIRED.L3_MISS"] / total;
    }
  }

  return data;
}

module.exports = { processData };
