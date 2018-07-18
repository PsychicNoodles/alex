const d3 = require("d3");

/**
 * Render the the scatter plot within the chart.
 */
function render(root, { data, densityMax, spectrum }) {
  root.classed("plot", true);

  // Create the points and position them in the plot
  const circles = (root.select("g").empty()
    ? root.append("g").attr("class", "circles")
    : root.select("g")
  )
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

  circles.exit().remove();
}

module.exports = { render };
