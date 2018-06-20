const d3 = require("d3");

const PLOT_WIDTH = 500;
const PLOT_HEIGHT = 250;

module.exports = { findMax, PLOT_WIDTH, PLOT_HEIGHT };

/* This function helps prepare for the scale, finding the max using attr,
a string */
function findMax(timeslices, attr) {
  switch (attr) {
    case "cache":
      return d3.max(timeslices, d => d.events.missRate);
    case "density":
      return d3.max(timeslices, d => d.densityAvg);
  }
}
