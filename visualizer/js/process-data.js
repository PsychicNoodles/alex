//
// Process the data, but do not draw it.
// Processing mutates the data.
//

const { cloneDeep } = require("lodash");

function processData(immutableData, header) {
  const data = cloneDeep(immutableData);

  // STUFF I ADDED FOR POWER
  //data[0].events.missRate = 0;
  //console.log("length: ", data.length);
  //for (var i = 1; i < data.length; i++) {
  //  data[i].events.missRate = data[i].events["dram"] - data[i - 1].events["dram"];
  //  console.log("core: ", data[i].events.missRate);
  //}

  // A list of event names
  const hitsEvents = header.presets.cache.hits;
  const missesEvents = header.presets.cache.misses;

  const initialCPUTime = data[0].cpuTime;
  let initialPower = data[0].events["package-0"];
  for (const timeslice of data) {
    // Remove the initial offset from CPU time
    timeslice.cpuTime -= initialCPUTime;

    timeslice.events.missRate = timeslice.events["package-0"] - initialPower; // Remove the initial offset from power
    initialPower = timeslice.events["package-0"];

    // Deselect all
    timeslice.selected = false;

    // Convert cache to miss-rate data
    /*let hitsTotal = 0;
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
    }*/
  }

  return data;
}

module.exports = { processData };
