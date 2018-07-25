const d3 = require("d3");
const { legendColor } = require("d3-svg-legend");

function render(root, { densityMax, spectrum }) {
  root.classed("legend", true);

  // If the SVG has anything in it, get rid of it. We want a clean slate.
  root.selectAll("*").remove();

  const sequentialScale = d3.scaleSequential(spectrum).domain([0, densityMax]);

  if (root.select("h3").empty()) {
    root
      .append("h3")
      .text("Legend")
      .attr("class", "legend__title");
  }

  root
    .append("svg")
    .attr("class", "legend__legend-sequential")
    .append("g")
    .attr("class", "legend__legend")
    .attr("transform", "translate(0,30)");

  const legendSequential = legendColor()
    .cells(6)
    .orient("horizontal")
    .shapeWidth(30)
    .scale(sequentialScale);

  root.select(".legend__legend").call(legendSequential);
}

module.exports = { render };
