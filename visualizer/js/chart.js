const d3 = require("d3");

const plot = require("./plot");
const brushes = require("./brushes");
const warnings = require("./warnings");
const legend = require("./legend");

const WIDTH = 500;
const HEIGHT = 250;

function render(
  root,
  {
    getIndependentVariable,
    getDependentVariable,
    xAxisLabelText,
    yAxisLabelText,
    xScale,
    yScale,
    brush,
    yFormat,
    plotData,
    densityMax,
    spectrum,
    cpuTimeOffset,
    warningRecords,
    warningsDistinct,
    currentYScale,
    onYScaleDomainChange
  }
) {
  root.classed("chart", true);

  const svg = root.select("svg.chart__svg").empty()
    ? root
        .append("svg")
        .attr("class", "chart__svg")
        .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`)
    : root.select("svg.chart__svg");

  if (root.select("g.warning-lines").empty()) {
    svg.append("g").call(warnings.renderLines, {
      xScale,
      warningRecords,
      warningsDistinct,
      cpuTimeOffset
    });
  }

  const chartPlot = root.select("g.plot").empty()
    ? svg.append("g")
    : svg.select("g.plot");

  chartPlot.call(plot.render, {
    data: plotData,
    xGetter: d => xScale(getIndependentVariable(d)),
    yGetter: d => currentYScale(getDependentVariable(d)),
    densityMax,
    spectrum
  });

  if (root.select("g.brushes").empty()) {
    svg.append("g").call(brushes.render);
  }

  const xAxis = root.select("g.chart__axis--x").empty()
    ? svg
        .append("g")
        .attr("class", "chart__axis chart__axis--x")
        .attr("transform", `translate(0, ${HEIGHT})`)
    : svg.select("g.chart__axis--x");

  xAxis.call(d3.axisBottom(xScale).tickFormat(d3.format(".2s")));

  xAxis.select(".chart__axis-label--x").empty()
    ? xAxis
        .append("text")
        .attr("class", "chart__axis-label chart__axis-label--x")
        .attr("text-anchor", "middle")
        .attr("x", WIDTH / 2)
        .attr("y", 50)
        .text(xAxisLabelText)
    : svg.select("chart__axis-label--x");

  //yAxis
  const yAxis = root.select("g.chart__axis--y").empty()
    ? svg.append("g").attr("class", "chart__axis chart__axis--y")
    : svg.select("g.chart__axis--y");

  yAxis.call(d3.axisLeft(currentYScale).tickFormat(yFormat));

  yAxis.select(".chart__axis-label--y").empty()
    ? yAxis
        .append("text")
        .attr("class", "chart__axis-label chart__axis-label--y")
        .attr("text-anchor", "middle")
        .attr("y", -40)
        .attr("x", -(HEIGHT / 2))
        .attr("transform", "rotate(-90)")
        .text(yAxisLabelText)
    : yAxis.select(".chart__axis-label--y").text(yAxisLabelText);

  //side bar
  const sideBar = root.select("g.chart__sideBar").empty()
    ? svg
        .append("g")
        .attr("class", "chart__sideBar")
        .attr("transform", `translate(${WIDTH * 1.01}, 0)`)
    : svg.select("g.chart__sideBar");

  const sideBarPlot = sideBar.select("g.plot").empty()
    ? sideBar.append("g")
    : sideBar.select("g.plot");

  sideBarPlot.call(plot.render, {
    data: plotData,
    // hiddenThreadsStore,
    xGetter: d => xScale(getIndependentVariable(d) * 0.075),
    yGetter: d => yScale(getDependentVariable(d)),
    densityMax,
    spectrum
  });

  //legend
  const chartLegend = root.select("g.chart__legend").empty()
    ? svg
        .append("g")
        .attr("class", "chart__legend")
        .attr("transform", `translate(${WIDTH * 0.7}, ${HEIGHT + 1.1})`)
    : svg.select("g.chart__legend");

  chartLegend.call(legend.render, {
    densityMax,
    spectrum
  });

  //brush
  brush.on("end", brushed);

  const sideBarBrush = sideBar.select("g.sideBar-brush").empty()
    ? sideBar
        .append("g")
        .attr("class", "sideBar-brush")
        .call(brush)
        .call(brush.move, currentYScale.domain().map(d => yScale(d)))
    : sideBar.select("g.sideBar-brush");

  sideBarBrush
    .selectAll(".handle")
    .attr("fill", "#666")
    .attr("fill-opacity", 0.8);

  function brushed() {
    const s = d3.event.selection || yScale.range();
    const newDomain = s.map(yScale.invert, yScale).map(n => n.toFixed(8));
    const oldDomain = currentYScale.domain().map(n => n.toFixed(8));
    if (oldDomain[0] !== newDomain[0] || oldDomain[1] !== newDomain[1]) {
      onYScaleDomainChange(newDomain);
    }
  }
}

module.exports = { render, WIDTH, HEIGHT };
