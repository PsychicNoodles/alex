//
// Render data to the DOM once it has been processed
//

const d3 = require("d3");
const { legendColor } = require("d3-svg-legend");

const chiSquaredTest = require("./analysis");
const { CHART_WIDTH, CHART_HEIGHT } = require("./util");
const plot = require("./plot");
const functionRuntimes = require("./function-runtimes");

const spectrum = d3.interpolateGreens;

function draw(
  timeslices,
  getIndependentVariable,
  getDependentVariable,
  xAxisLabel,
  yAxisLabel
) {
  /* SVG / D3 constructs needed by multiple subfunctions */
  const svg = d3.select("#chart");
  const svgLegend = d3.select("#legend"); // change to be part of main svg
  const xScaleMax = getIndependentVariable(timeslices[timeslices.length - 1]);
  const xScaleMin = getIndependentVariable(timeslices[0]);
  const yScaleMax = d3.max(timeslices, getDependentVariable);
  const xScale = d3
    .scaleLinear()
    .domain([xScaleMin, xScaleMax])
    .range([0, CHART_WIDTH]);
  const yScale = d3
    .scaleLinear()
    .domain([yScaleMax, 0])
    .range([0, CHART_HEIGHT]);
  const plotData = plot.getPlotData({
    data: timeslices,
    xScale,
    yScale,
    getIndependentVariable,
    getDependentVariable
  });
  const densityMax = d3.max(plotData, d => d.densityAvg);

  svg.attr("viewBox", `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`);

  // Clear the chart
  svg.selectAll("*").remove();

  /* Actual drawing */
  plot.render({
    data: plotData,
    xScale,
    yScale,
    getIndependentVariable,
    getDependentVariable,
    densityMax,
    svg,
    spectrum
  });

  const gBrushes = svg.append("g").attr("class", "brushes");
  const brushes = [];

  drawAxes({ xScale, yScale, xAxisLabel, yAxisLabel, svg });
  createBrush({
    timeslices,
    svg,
    brushes,
    gBrushes,
    xScale,
    getIndependentVariable
  });
  drawLegend(densityMax, svgLegend);
}

function drawAxes({ xScale, yScale, xAxisLabel, yAxisLabel, svg }) {
  // Create axes and format the ticks
  const formatAsPercentage = d3.format(".0%");
  const abbrev = d3.format(".2s");
  const xAxis = d3.axisBottom(xScale).tickFormat(abbrev);
  const yAxis = d3.axisLeft(yScale).tickFormat(formatAsPercentage);
  // Add the axes to the svg object
  svg
    .append("g")
    .attr("id", "xAxis")
    .attr("class", "axis")
    .attr("transform", "translate(0, " + CHART_HEIGHT + ")")
    .call(xAxis);

  svg
    .append("g")
    .attr("id", "yAxis")
    .attr("class", "axis")
    .call(yAxis);

  // Add labels to the axes
  svg
    .select("#xAxis")
    .append("text")
    .attr("class", "x label")
    .attr("text-anchor", "middle")
    .attr("x", CHART_WIDTH / 2)
    .attr("y", 50)
    .text(xAxisLabel);
  svg
    .select("#yAxis")
    .append("text")
    .attr("class", "y label")
    .attr("text-anchor", "middle")
    .attr("y", -40)
    .attr("x", -(CHART_HEIGHT / 2))
    .attr("transform", "rotate(-90)")
    .text(yAxisLabel);
}

function createBrush({
  timeslices,
  svg,
  brushes,
  gBrushes,
  xScale,
  getIndependentVariable
}) {
  const brush = d3
    .brushX()
    .extent([[0, 0], [CHART_WIDTH, CHART_HEIGHT]])
    .on("brush", () => {
      brushed({
        timeslices,
        xScale,
        svg,
        gBrushes,
        getIndependentVariable
      });
    })
    .on("end", () => {
      brushEnd(
        timeslices,
        brushes,
        gBrushes,
        svg,
        xScale,
        getIndependentVariable
      );
    });

  // Add brush to array of objects
  brushes.push({ id: brushes.length, brush: brush });
  drawBrushes(gBrushes, brushes);
}

function brushEnd(
  timeslices,
  brushes,
  gBrushes,
  svg,
  xScale,
  getIndependentVariable
) {
  d3.select(".function-runtimes").call(functionRuntimes.render, {
    data: timeslices.filter(d => d.selected)
  });
  const lastBrushId = brushes[brushes.length - 1].id;
  const lastBrush = document.getElementById("brush-" + lastBrushId);
  const selection = d3.brushSelection(lastBrush);

  // If the latest brush has a selection, make a new one
  if (selection && selection[0] !== selection[1]) {
    createBrush({
      timeslices,
      svg,
      brushes,
      gBrushes,
      xScale,
      getIndependentVariable
    });
  }

  const circles = svg.selectAll("circle");

  document.getElementById("btnClearBrushes").addEventListener("click", () => {
    clearBrushes({
      brushes,
      svg,
      circles,
      timeslices,
      xScale,
      gBrushes,
      getIndependentVariable
    });
  });
}

function drawBrushes(gBrushes, brushes) {
  const brushSelection = gBrushes.selectAll("g.brush").data(brushes, d => d.id);

  brushSelection
    .enter()
    .insert("g", ".brush")
    .attr("class", "brush")
    .merge(brushSelection)
    .attr("id", brush => "brush-" + brush.id)
    .each(function(brushObject) {
      brushObject.brush(d3.select(this));
      d3.select(this)
        .selectAll(".overlay")
        .style("pointer-events", () => {
          const brush = brushObject.brush;
          if (brushObject.id === brushes.length - 1 && brush !== undefined) {
            return "all";
          } else {
            return "none";
          }
        });
    });

  brushSelection.exit().remove();
}

// Re-color the circles in the region that was selected by the user
function brushed({
  timeslices,
  xScale,
  svg,
  gBrushes,
  getIndependentVariable
}) {
  if (d3.event.selection !== null) {
    const circles = svg.selectAll("circle");

    circles.attr("class", "");

    for (const timeslice of timeslices) {
      timeslice.selected = false;
    }

    gBrushes.selectAll("g.brush").each(function() {
      const brushArea = d3.brushSelection(this);

      if (brushArea) {
        circles
          .filter(function() {
            const cx = d3.select(this).attr("cx");
            return brushArea[0] <= cx && cx <= brushArea[1];
          })
          .attr("class", "brushed");

        for (const timeslice of timeslices) {
          const x = xScale(getIndependentVariable(timeslice));
          if (brushArea[0] <= x && x <= brushArea[1]) {
            timeslice.selected = true;
          }
        }
      }
    });

    const chiSquaredData = chiSquaredTest(timeslices);
    const probability = chiSquaredData.probability;
    const probabilityPercentage = (probability * 100).toFixed(3);
    if (probability !== -1) {
      console.log(
        `The likelihood that your selection is unusual is ~${probabilityPercentage}%`
      );
    }
    console.log(chiSquaredData.functionList);
  }
}

function clearBrushes({
  brushes,
  svg,
  timeslices,
  xScale,
  circles,
  gBrushes,
  getIndependentVariable
}) {
  while (brushes.length > 0) {
    brushes.pop();
  }
  gBrushes.selectAll(".brush").remove();
  createBrush({
    timeslices,
    svg,
    brushes,
    gBrushes,
    xScale,
    getIndependentVariable
  });
  for (const timeslice of timeslices) {
    timeslice.selected = false;
  }
  circles.attr("class", "circle");
}

function drawLegend(densityMax, svg) {
  // If the SVG has anything in it, get rid of it. We want a clean slate.
  svg.selectAll("*").remove();

  const sequentialScale = d3.scaleSequential(spectrum).domain([0, densityMax]);

  svg
    .append("g")
    .attr("class", "legendSequential")
    .attr("transform", "translate(0,30)");

  const legendSequential = legendColor()
    .title("Density")
    .cells(6)
    .orient("vertical")
    .ascending(true)
    .scale(sequentialScale);

  svg.select(".legendSequential").call(legendSequential);
}

module.exports = { draw };
