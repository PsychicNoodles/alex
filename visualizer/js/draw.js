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
  data,
  getIndependentVariable,
  getDependentVariable,
  xAxisLabel,
  yAxisLabel
) {
  /* SVG / D3 constructs needed by multiple subfunctions */
  const svg = d3.select("#chart");
  const svgLegend = d3.select("#legend"); // change to be part of main svg
  const xScaleMax = getIndependentVariable(data[data.length - 1]);
  const yScaleMax = d3.max(data, getDependentVariable);
  const xScale = d3
    .scaleLinear()
    .domain([0, xScaleMax])
    .range([0, CHART_WIDTH]);
  const yScale = d3
    .scaleLinear()
    .domain([yScaleMax, 0])
    .range([0, CHART_HEIGHT]);
  const plotData = plot.getPlotData({
    data,
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
  const circles = plot.render({
    data: plotData,
    xScale,
    yScale,
    getIndependentVariable,
    getDependentVariable,
    densityMax,
    svg,
    spectrum
  });

  const gBrushes = svg.append('g')
    .attr("class", "brushes");
  const brushes = [];

  drawAxes(xScale, yScale, xAxisLabel, yAxisLabel, svg);
  createBrush(data, circles, brushes, gBrushes, xScale, getIndependentVariable);
  drawBrushes(gBrushes, brushes);
  drawLegend(densityMax, svgLegend);
}

function drawAxes(xScale, yScale, xAxisLabel, yAxisLabel, svg) {
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

function createBrush(timeslices, circles, brushes, gBrushes, xScale, getIndependentVariable) {
  var brush = d3
    .brushX()
    .extent([[0, 0], [CHART_WIDTH, CHART_HEIGHT]])
    .on("start", function () { brushed({ brush: this, timeslices, xScale, circles, getIndependentVariable }); })
    .on("brush", function () { brushed({ brush: this, timeslices, xScale, circles, getIndependentVariable }); })
    .on("end", function () { brushEnd(timeslices, brushes, gBrushes, circles, xScale, getIndependentVariable); });

  // Add brush to array of objects
  brushes.push({ id: brushes.length, brush: brush });
}

function brushEnd(timeslices, brushes, gBrushes, circles, xScale, getIndependentVariable) {
  d3.select(".function-runtimes").call(functionRuntimes.render, { data: timeslices.filter(d => d.selected) });
  var lastBrushId = brushes[brushes.length - 1].id;
  var lastBrush = document.getElementById('brush-' + lastBrushId);
  var selection = d3.brushSelection(lastBrush);

  // If the latest brush has a selection, make a new one
  if (selection && selection[0] !== selection[1]) {
    createBrush(timeslices, circles, brushes, gBrushes, xScale, getIndependentVariable);
  }

  drawBrushes(gBrushes, brushes);
}

function drawBrushes(gBrushes, brushes) {
  var brushSelection = gBrushes
      .selectAll("g.brush")
      .data(brushes, function(d) { return d.id; });

  brushSelection.enter()
      .insert('g', '.brush')
      .attr('class', 'brush')
    .merge(brushSelection)
      .attr('id', function (brush) { return 'brush-' + brush.id; })
      .each(function (brushObject) {
        brushObject.brush(d3.select(this));
        d3.select(this)
          .selectAll('.overlay')
          .style('pointer-events', 
            function () {
              var brush = brushObject.brush;
              if (brushObject.id === brushes.length - 1 && brush != undefined) {
                return 'all';
              } else {
                return 'none';
              }
            });
    });

  brushSelection.exit()
    .remove();
}

// Re-color the circles in the region that was selected by the user
function brushed({ brush, timeslices, xScale, circles, getIndependentVariable }) {
  if (d3.event.selection !== null) {
    circles.attr("class", "circle");
    const brushArea = d3.brushSelection(brush);

    circles
      .filter(function () {
        const cx = d3.select(brush).attr("cx");
        return brushArea[0] <= cx && cx <= brushArea[1];
      })
      .attr("class", "brushed");

    for (const timeslice of timeslices) {
      const x = xScale(getIndependentVariable(timeslice));
      timeslice.selected = brushArea[0] <= x && x <= brushArea[1];
    }
  }
  const chiSquared = chiSquaredTest(timeslices);
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
