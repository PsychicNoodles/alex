/**
 * Render the the scatter plot within the chart.
 * @param {d3.Selection} root
 */
function render(root, { data, densityMax, spectrum, xGetter, yGetter }) {
  root.classed("plot", true);

  // Create the points and position them in the plot
  const circles = (root.select("svg.circles").empty()
    ? root.append("svg").attr("class", "circles")
    : root.select("svg.circles")
  ) //S.selectAll("*").remove()
    .selectAll("circle")
    .data(data);

  circles
    .enter()
    .append("circle")
    .merge(circles)
    .attr("class", "circle")
    .attr("cx", d => xGetter(d))
    .attr("cy", d => yGetter(d))
    .attr("r", 1)
    .style("fill", d => spectrum(d.densityAvg / densityMax));

  circles.exit().remove();
}

module.exports = { render };
