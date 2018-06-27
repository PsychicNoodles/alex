//
// Process the data, but do not draw it.
// Processing mutates the data.
//

const { cloneDeep } = require("lodash");

function processData(immutableData, header) {
  const data = cloneDeep(immutableData);

  // Accumulate cycles and instructions
  const numCPUCyclesEvents = header.presets.cpu.numCPUCycles;
  const numInstructionsEvents = header.presets.cpu.numInstructions;
  for (let i = 0; i < data.length; i++) {
    const cur = data[i];

    let numCPUCyclesTotal = 0;
    for (const event of numCPUCyclesEvents) {
      numCPUCyclesTotal += cur.events[event];
    }

    let numInstructionsTotal = 0;
    for (const event of numInstructionsEvents) {
      numInstructionsTotal += cur.events[event];
    }

    if (i === 0) {
      cur.cyclesSoFar = numCPUCyclesTotal;
      cur.instructionsSoFar = numInstructionsTotal;
    } else {
      cur.cyclesSoFar = numCPUCyclesTotal + data[i - 1].cyclesSoFar;
      cur.instructionsSoFar =
        numInstructionsTotal + data[i - 1].instructionsSoFar;
    }
  }

  // Convert cache to missRate data
  const hitsEvents = header.presets.cache.hits;
  const missesEvents = header.presets.cache.misses;

  for (let i = 0; i < data.length; i++) {
    const cur = data[i];

    let hitsTotal = 0;
    for (const event of hitsEvents) {
      hitsTotal += cur.events[event];
    }

    let missesTotal = 0;
    for (const event of missesEvents) {
      missesTotal += cur.events[event];
    }

    const accessesTotal = hitsTotal + missesTotal;
    if (accessesTotal === 0) {
      cur.events.missRate = 0;
    } else {
      cur.events.missRate = missesTotal / accessesTotal;
    }
    cur.selected = false;
  }

  return data;
}

module.exports = { processData };
