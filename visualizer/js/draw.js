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
  drawAxes(xScale, yScale, xAxisLabel, yAxisLabel, svg);
  drawBrush({ data, xScale, svg, circles, getIndependentVariable });
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

function drawBrush({ data, xScale, svg, circles, getIndependentVariable }) {
  const x = d3
    .scaleLinear()
    .domain([0, 20])
    .range([0, CHART_WIDTH]);

  // Create brush
  const brush = d3
    .brushX()
    .extent([[0, 0], [CHART_WIDTH, CHART_HEIGHT]])
    .on("brush", function() {
      brushed({ brush: this, data, xScale, circles, getIndependentVariable });
    })
    .on("end", () =>
      d3.select(".function-runtimes").call(functionRuntimes.render, { data })
    );

  // Add brush to SVG object
  svg
    .select("#plot")
    .append("g")
    .attr("class", "brush")
    .call(brush)
    .call(brush.move, [x(0), x(1)])
    .selectAll(".overlay")
    .attr("width", CHART_WIDTH)
    .attr("height", CHART_HEIGHT)
    .each(d => {
      d.type = "selection";
    })
    .on("click", function() {
      brushCentered.call(this, brush, x);
    });
}

// Re-center brush when the user clicks somewhere in the plot
function brushCentered(brush, x) {
  const dx = x(1) - x(0), // Use a fixed width when recentering.
    cx = d3.mouse(this)[0],
    x0 = cx - dx / 2,
    x1 = cx + dx / 2;
  d3.select(this.parentNode).call(
    brush.move,
    x1 > CHART_WIDTH
      ? [CHART_WIDTH - dx, CHART_WIDTH]
      : x0 < 0
        ? [0, dx]
        : [x0, x1]
  );
}

// Re-color the circles in the region that was selected by the user
function brushed({ brush, data, xScale, circles, getIndependentVariable }) {
  if (d3.event.selection !== null) {
    circles.attr("class", "circle");
    const brushArea = d3.brushSelection(brush);

    circles
      .filter(function() {
        const cx = d3.select(this).attr("cx");
        return brushArea[0] <= cx && cx <= brushArea[1];
      })
      .attr("class", "brushed");

    for (const d of data) {
      const x = xScale(getIndependentVariable(d));
      d.selected = brushArea[0] <= x && x <= brushArea[1];
    }
  }
  const chiSquared = chiSquaredTest(data);
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
