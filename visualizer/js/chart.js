const d3 = require("d3");

const plot = require("./plot");
const brushes = require("./brushes");
const warnings = require("./warnings");

const WIDTH = 500;
const HEIGHT = 250;

function render(
  root,
  {
    spectrum,
    plotData,
    hiddenThreadsStore,
    densityMax,
    getIndependentVariable,
    getDependentVariable,
    xAxisLabelText,
    yAxisLabelText,
    xScale,
    yScale,
    yScale_present,
    brush,
    yFormat,
    cpuTimeOffset,
    warningRecords,
    warningsDistinct
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
    hiddenThreadsStore,
    xGetter: d => xScale(getIndependentVariable(d)),
    yGetter: d => yScale_present(getDependentVariable(d)),
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
    ? svg
        .append("g")
        .attr("class", "chart__axis chart__axis--y")
        .call(d3.axisLeft(yScale_present).tickFormat(yFormat))
    : svg.select("g.chart__axis--y");

  yAxis.call(d3.axisLeft(yScale_present).tickFormat(yFormat));

  yAxis.select(".chart__axis-label--y").empty()
    ? yAxis
        .append("text")
        .attr("class", "chart__axis-label chart__axis-label--y")
        .attr("text-anchor", "middle")
        .attr("y", -40)
        .attr("x", -(HEIGHT / 2))
        .attr("transform", "rotate(-90)")
        .text(yAxisLabelText)
    : svg.select("chart__axis-label--y").text(yAxisLabelText);

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
    hiddenThreadsStore,
    xGetter: d => xScale(getIndependentVariable(d) * 0.075),
    yGetter: d => yScale(getDependentVariable(d)),
    densityMax,
    spectrum
  });

  //brush
  brush.on("brush", brushed);

  sideBar.select("g.sideBar-brush").empty()
    ? sideBar
        .append("g")
        .attr("class", "sideBar-brush")
        .call(brush)
        .call(brush.move, yScale.range())
    : sideBar.select("g.sideBar-brush");

  function brushed() {
    const s = d3.event.selection || yScale.range();
    yScale_present.domain(s.map(yScale.invert, yScale));

    svg
      .select(".plot")
      .selectAll("circle")
      .data(plotData)
      .attr("cy", d => yScale_present(getDependentVariable(d)));
    svg
      .select(".chart__axis--y")
      .call(d3.axisLeft(yScale_present).tickFormat(yFormat));
  }
}

module.exports = { render, WIDTH, HEIGHT };
