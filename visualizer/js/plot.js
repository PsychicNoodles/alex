const d3 = require("d3");

/**
 * Render the the scatter plot within the chart.
 */
function render(root, { data, densityMax, spectrum }) {
  root.classed("plot", true);

  // Create the points and position them in the plot
  const circles = root
    .append("g")
    .attr("class", "circles")
    .selectAll("circle")
    .data(data);

  circles
    .enter()
    .append("circle")
    .merge(circles)
    .attr("class", "circle")
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", 1)
    .style("fill", d =>
      d3.scaleSequential(spectrum)(d.densityAvg / densityMax)
    );
}

function toggleCircles(root, { data }) {
  const circlesData = root.selectAll("circle").data(data);

  // note: there's no handling for new elements as they need to be rendered above first

  circlesData
    .enter()
    .merge(circlesData)
    .style("opacity", 1);

  circlesData.exit().style("opacity", 0);
}

module.exports = { render, toggleCircles };
