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
    yScale_present,
    brush,
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
    xGetter: d => xScale(getIndependentVariable(d)),
    yGetter: d => yScale_present(getDependentVariable(d)),
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
    .call(d3.axisLeft(yScale_present).tickFormat(yFormat))

    // Label
    .append("text")
    .attr("class", "chart__axis-label chart__axis-label--y")
    .attr("text-anchor", "middle")
    .attr("y", -40)
    .attr("x", -(HEIGHT / 2))
    .attr("transform", "rotate(-90)")
    .text(yAxisLabel);

  //side bar
  const g = svg
    .append("g")
    .attr("class", "chart__sideBar")
    .attr("transform", `translate(${WIDTH * 1.01}, 0)`);

  g.append("g").call(plot.render, {
    data: plotData,
    hiddenThreadsStore,
    xGetter: d => xScale(getIndependentVariable(d) * 0.075),
    yGetter: d => yScale(getDependentVariable(d)),
    densityMax,
    spectrum
  });

  //brush

  brush.on("brush", brushed1);

  g.append("g")
    .attr("class", "y brush")
    .call(brush)
    .call(brush.move, yScale.range());

  function brushed1() {
    console.log(this);
    const s = d3.event.selection || yScale.range();
    yScale_present.domain(s.map(yScale.invert, yScale));
    console.log(plotData);

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
    yAxisLabel,
    xScale,
    yScale,
    yScale_present,
    brush,
    yFormat
  }
) {
  const svg = root.select("svg");

  svg.select("g.plot").call(plot.render, {
    data: plotData,
    hiddenThreadsStore,
    xGetter: d => xScale(getIndependentVariable(d)),
    yGetter: d => yScale_present(getDependentVariable(d)),
    densityMax,
    spectrum
  });

  svg
    .select("g.chart__axis--x")
    .call(d3.axisBottom(xScale).tickFormat(d3.format(".2s")));

  svg
    .select("g.chart__axis--y")
    .call(d3.axisLeft(yScale_present).tickFormat(yFormat))
    .select(".chart__axis-label--y")
    .attr("class", "chart__axis-label chart__axis-label--y")
    .attr("text-anchor", "middle")
    .attr("y", -40)
    .attr("x", -(HEIGHT / 2))
    .attr("transform", "rotate(-90)")
    .text(yAxisLabel);

  //side bar
  const g = svg.select("g.chart__sideBar");

  g.select("g.plot").call(plot.render, {
    data: plotData,
    hiddenThreadsStore,
    xGetter: d => xScale(getIndependentVariable(d) * 0.075),
    yGetter: d => yScale(getDependentVariable(d)),
    densityMax,
    spectrum
  });

  function brushed2() {
    const s = d3.event.selection || yScale.range();
    yScale_present.domain(s.map(yScale.invert, yScale));
    console.log(plotData);

    svg
      .select(".plot")
      .selectAll("circle")
      .data(plotData)
      .attr("cy", d => yScale_present(getDependentVariable(d)));
    svg
      .select(".chart__axis--y")
      .call(d3.axisLeft(yScale_present).tickFormat(yFormat));
  }

  brush.on("brush", brushed2);

  console.log();
}

module.exports = { create, updateData, WIDTH, HEIGHT };
