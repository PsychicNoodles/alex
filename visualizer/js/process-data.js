//
// Process the data, but do not draw it.
// Processing mutates the data.
//

const { cloneDeep } = require("lodash");

function isInvalidTimeslice(timeslice) {
  return (
    timeslice.cpuTime === 0 ||
    timeslice.stackFrames === undefined ||
    timeslice.stackFrames.length === 0 ||
    timeslice.stackFrames.every(sf => sf.address === "(nil)") ||
    timeslice.pid === 0 ||
    timeslice.tid === 0
  );
}

function processData(immutableData, header) {
  const data = cloneDeep(immutableData);

  // A list of event names
  const hitsEvents = header.presets.cache.hits;
  const missesEvents = header.presets.cache.misses;

  const initialCPUTime = data[0].cpuTime;
  let i = data.length;
  while (i--) {
    const timeslice = data[i];
    if (isInvalidTimeslice(timeslice)) {
      data.splice(i, 1);
      continue;
    }

    // Remove the initial offset from CPU time
    timeslice.cpuTime -= initialCPUTime;

    // Deselect all
    timeslice.selected = false;

    // Convert cache to miss-rate data
    let hitsTotal = 0;
    for (const event of hitsEvents) {
      hitsTotal += timeslice.events[event];
    }

    let missesTotal = 0;
    for (const event of missesEvents) {
      missesTotal += timeslice.events[event];
    }

    const accessesTotal = hitsTotal + missesTotal;
    if (accessesTotal === 0) {
      timeslice.events.missRate = 0;
    } else {
      timeslice.events.missRate = missesTotal / accessesTotal;
    }
  }

  return data;
}

module.exports = { processData };
