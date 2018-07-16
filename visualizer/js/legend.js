const d3 = require("d3");
const { legendColor } = require("d3-svg-legend");

function render(root, { densityMax, spectrum }) {
  root.classed("legend", true);

  // If the SVG has anything in it, get rid of it. We want a clean slate.
  root.selectAll("*").remove();

  const sequentialScale = d3.scaleSequential(spectrum).domain([0, densityMax]);

  root
    .append("svg")
    .append("g")
    .attr("class", "legendSequential")
    .attr("transform", "translate(0,30)");

  const legendSequential = legendColor()
    .title("Density")
    .cells(6)
    .orient("vertical")
    .ascending(true)
    .scale(sequentialScale);

  root.select(".legendSequential").call(legendSequential);
}

module.exports = { render };
