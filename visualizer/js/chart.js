const d3 = require("d3");

const plot = require("./plot");
const brushes = require("./brushes");

const WIDTH = 500;
const HEIGHT = 250;

function render(
  root,
  {
    spectrum,
    plotData,
    densityMax,
    getIndependentVariable,
    getDependentVariable,
    xAxisLabel,
    yAxisLabel,
    xScale,
    yScale,
    yFormat
  }
) {
  root.classed("chart", true).attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);

  root.selectAll("*").remove();

  root.append("g").call(plot.render, {
    data: plotData,
    xScale,
    yScale,
    getIndependentVariable,
    getDependentVariable,
    densityMax,
    spectrum
  });

  root.append("g").call(brushes.render);

  root
    .append("g")
    .attr("class", "chart__axis chart__axis--x")
    .attr("transform", `translate(0, ${HEIGHT})`)
    .call(d3.axisBottom(xScale).tickFormat(d3.format(".2s")))

    // Label
    .append("text")
    .attr("class", "chart__axis-label chart__axis-label--x")
    .attr("text-anchor", "middle")
    .attr("x", WIDTH / 2)
    .attr("y", 50)
    .text(xAxisLabel);

  root
    .append("g")
    .attr("class", "chart__axis chart__axis--y")
    .call(d3.axisLeft(yScale).tickFormat(yFormat))

    // Label
    .append("text")
    .attr("class", "chart__axis-label chart__axis-label--y")
    .attr("text-anchor", "middle")
    .attr("y", -40)
    .attr("x", -(HEIGHT / 2))
    .attr("transform", "rotate(-90)")
    .text(yAxisLabel);
}

module.exports = { render, WIDTH, HEIGHT };
