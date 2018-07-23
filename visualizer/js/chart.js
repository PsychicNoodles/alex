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
    warningsDistinct,
    densityMax_local,
    densityMax_local_present,
    densityMap
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

  const xAxisLabel = xAxis.select(".chart__axis-label--x").empty()
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

  const yAxisLabel = yAxis.select(".chart__axis-label--y").empty()
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

  const sideBarBrush = sideBar.select("g.sideBar-brush").empty()
    ? sideBar
        .append("g")
        .attr("class", "sideBar-brush")
        .call(brush)
        .call(brush.move, yScale.range())
    : sideBar.select("g.sideBar-brush");

  const handle = sideBarBrush
    .selectAll(".handle")
    .attr("fill", "#666")
    .attr("fill-opacity", 0.8);

  function brushed() {
    const s = d3.event.selection || yScale.range();
    yScale_present.domain(s.map(yScale.invert, yScale));
    const scale =
      (yScale_present.domain()[1] - yScale_present.domain()[0]) /
      (yScale.domain()[1] - yScale.domain()[0]);
    //console.log(yScale_present.domain()[1], yScale_present.domain()[0], yScale.domain()[1],  yScale.domain()[0])
    if (densityMax_local_present === densityMax) {
      //densityMax will change
      densityMax_local_present = densityMax_local * scale;
      //console.log("local_present ", densityMax_local_present);
      densityMap.set(yAxisLabelText, densityMax_local_present);
      //console.log(densityMap);

      const densityMaxOld = densityMax;
      densityMax = 0;
      for (const densityMax_local_present of densityMap.values()) {
        densityMax = Math.max(densityMax, densityMax_local_present);
      } //find the new densityMax
      console.log(densityMax);

      const colorScale = d3.scaleSequential(spectrum);
      const colorScaleInvert = spectrum.invert;
      console.log(spectrum);
      d3.selectAll("circle").each(function(d, i) {
        d3.select(this).style("fill", "#777"); //d3.scaleSequential(spectrum).invert((d3.select(this).style("fill"))) * densityMaxOld /densityMax);
      });
    } else {
      //densityMax wont change
      densityMax_local_present = densityMax_local * scale;
      //console.log("local_present ", densityMax_local_present);
      densityMap.set(yAxisLabelText, densityMax_local_present);
      //console.log(densityMap);
    }

    svg
      .select(".plot")
      .selectAll("circle")
      .data(plotData)
      .attr("cy", d => yScale_present(getDependentVariable(d)))
      .style("fill", d => {
        d.densityAvgPresent = d.densityAvg * scale;
        return d3.scaleSequential(spectrum)(d.densityAvgPresent / densityMax);
      });
    svg
      .select(".chart__axis--y")
      .call(d3.axisLeft(yScale_present).tickFormat(yFormat));

    console.log("la", densityMax);

    d3.select("#legend")
      .style("display", "block")
      .call(legend.render, {
        densityMax,
        spectrum
      });
  }
}

module.exports = { render, WIDTH, HEIGHT };
