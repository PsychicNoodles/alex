const d3 = require("d3");

const plot = require("./plot");
const brushes = require("./brushes");
const warnings = require("./warnings");

const WIDTH = 500;
const HEIGHT = 250;

function create(
  root,
  {
    spectrum,
    plotData,
    hiddenThreadsStore,
    densityMax,
    getIndependentVariable,
    getDependentVariable,
    xAxisLabel,
    yAxisLabel,
    xScale,
    yScale,
    yFormat,
    cpuTimeOffset,
    warningRecords,
    warningsDistinct
  }
) {
  root.classed("chart", true);

  const svg = root
    .append("svg")
    .attr("class", "chart__svg")
    .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);

  svg.append("g").call(warnings.renderLines, {
    xScale,
    warningRecords,
    warningsDistinct,
    cpuTimeOffset
  });

  svg.append("g").call(plot.render, {
    data: plotData,
    hiddenThreadsStore,
    xScale,
    yScale,
    getIndependentVariable,
    getDependentVariable,
    densityMax,
    spectrum
  });

  svg.append("g").call(brushes.render);

  svg
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

  svg
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

/*
 * Updates the children that rely on (plot) data.
 */
function updateData(
  root,
  {
    spectrum,
    plotData,
    hiddenThreadsStore,
    densityMax,
    getIndependentVariable,
    getDependentVariable,
    xScale,
    yScale,
    yFormat
  }
) {
  const svg = root.select("svg");

  svg.select("g.plot").call(plot.render, {
    data: plotData,
    hiddenThreadsStore,
    xScale,
    yScale,
    getIndependentVariable,
    getDependentVariable,
    densityMax,
    spectrum
  });

  svg
    .select("g.chart__axis--x")
    .call(d3.axisBottom(xScale).tickFormat(d3.format(".2s")));

  svg.select("g.chart__axis--y").call(d3.axisLeft(yScale).tickFormat(yFormat));
}

module.exports = { create, updateData, WIDTH, HEIGHT };
