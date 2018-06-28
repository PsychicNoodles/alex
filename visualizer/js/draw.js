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
let nextBrushId = 0;

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
  const yScaleMax = d3.max(timeslices, getDependentVariable);
  const xScale = d3
    .scaleLinear()
    .domain([0, xScaleMax])
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

  const gBrushes = svg.insert("g").attr("class", "brushes");
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
    .on("brush", function() {
      return brushed({
        currentBrush: this,
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
  brushes.push({ id: nextBrushId, brush: brush });
  nextBrushId++;
  drawBrushes(brushes, gBrushes);
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

  const probability = chiSquaredTest(timeslices);
  const probabilityPercentage = probability * 100;
  if (probability !== -1) {
    console.log(
      `The likelihood that your selection is unusual is ~${probabilityPercentage}%`
    );
  }
}

function drawBrushes(brushes, gBrushes) {
  const brushSelection = gBrushes.selectAll("g.brush").data(brushes, d => d.id);

  const brushEnterSelection = brushSelection
    .enter()
    .insert("g", ".brush")
    .attr("class", "brush brush--invisible");

  brushEnterSelection
    .merge(brushSelection)
    .attr("id", brush => "brush-" + brush.id)
    .each(function(brushObject) {
      brushObject.brush(d3.select(this));
      d3.select(this)
        .selectAll(".overlay")
        .style("pointer-events", () => {
          const brush = brushObject.brush;
          if (
            brushObject.id === brushes[brushes.length - 1].id &&
            brush !== undefined
          ) {
            return "all";
          } else {
            return "none";
          }
        });
    });

  brushSelection.exit().remove();

  brushEnterSelection.each(function() {
    const gclearBrush = d3
      .select(this)
      .append("g")
      .attr("class", "brush__close")
      .attr("pointer-events", "all");

    gclearBrush
      .append("path")
      .attr(
        "d",
        "M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 " +
          "16.41,20 12,20M12,2C6.47,2 2,6.47 2,12C2,17.53 6.47,22 12,22C17.53,22 22,17.53 " +
          "22,12C22,6.47 17.53,2 12,2M14.59,8L12,10.59L9.41,8L8,9.41L10.59,12L8,14.59L9.41," +
          "16L12,13.41L14.59,16L16,14.59L13.41,12L16,9.41L14.59,8Z"
      )
      .attr("class", "brush__close")
      .on("click", () => {
        const index = brushes.findIndex(d => "brush-" + d.id === this.id);
        brushes.splice(index, 1);
        d3.select(this).remove();
      });
  });
}

// Re-color the circles in the region that was selected by the user
function brushed({
  currentBrush,
  timeslices,
  xScale,
  svg,
  gBrushes,
  getIndependentVariable
}) {
  const selection = d3.event.selection;
  if (selection !== null) {
    const circles = svg.selectAll(".circles circle");

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

    d3.select(currentBrush)
      .select(".brush__close")
      .attr(
        "transform",
        `translate(${d3.brushSelection(currentBrush)[1] - 24},0)`
      );
    d3.select(currentBrush).attr("class", "brush");
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
  brushes.splice(0);

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
