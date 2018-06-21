//
// Render data to the DOM once it has been processed
//

const d3 = require("d3");
const { legendColor } = require("d3-svg-legend");

const { CHART_WIDTH, CHART_HEIGHT } = require("./util");

module.exports = { draw };

const SPECTRUM = d3.interpolateGreens;

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
  const densityMax = d3.max(data, d => d.densityAvg);

  svg.attr("viewBox", `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`);

  // Clear the chart
  svg.selectAll("*").remove();

  /* Actual drawing */
  const circles = drawPlot(
    data,
    xScale,
    yScale,
    getIndependentVariable,
    getDependentVariable,
    densityMax,
    svg
  );
  drawAxes(xScale, yScale, xAxisLabel, yAxisLabel, svg);
  drawBrush(data, xScale, svg, circles);
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

/* This func makes the scatter plot */
function drawPlot(
  data,
  xScale,
  yScale,
  getIndependentVariable,
  getDependentVariable,
  densityMax,
  svg
) {
  // Create the points and position them in the plot
  const plot = svg.append("g").attr("id", "plot");

  const circles = plot
    .append("g")
    .attr("class", "circles")
    .selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", d => xScale(getIndependentVariable(d)))
    .attr("cy", d => yScale(getDependentVariable(d)))
    .attr("r", 1)
    .style("fill", d =>
      d3.scaleSequential(SPECTRUM)(d.densityAvg / densityMax)
    );
  return circles; // FIX: this is gross
}

function drawBrush(data, xScale, svg, circles) {
  const x = d3
    .scaleLinear()
    .domain([0, 20])
    .range([0, CHART_WIDTH]);

  // Create brush
  const brush = d3
    .brushX()
    .extent([[0, 0], [CHART_WIDTH, CHART_HEIGHT]])
    .on("brush", function() {
      brushed.call(this, data, xScale, circles);
    })
    .on("end", () => createTable(data));

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
function brushed(data, xScale, circles) {
  if (d3.event.selection !== null) {
    circles.attr("class", "circle");
    const brushArea = d3.brushSelection(this);

    circles
      .filter(function() {
        const cx = d3.select(this).attr("cx");
        return brushArea[0] <= cx && cx <= brushArea[1];
      })
      .attr("class", "brushed");

    for (let i = 0; i < data.length; i++) {
      data[i].selected = false;
    }

    data.map(d => {
      if (
        brushArea[0] <= xScale(d.cyclesSoFar) &&
        xScale(d.cyclesSoFar) <= brushArea[1]
      ) {
        d.selected = true;
      }
    });
  }
}

// Create a table of the points selected by the brush
function createTable(data) {
  d3.selectAll(".row_data").remove();
  d3.select("table").style("visibility", "visible");

  const circlesSelected = d3.selectAll(".brushed").data();

  if (circlesSelected.length > 0) {
    data.forEach(d => {
      if (d.selected) {
        const formatRate = d3.format(".1%");
        const data = [
          d.cyclesSoFar,
          d.events["MEM_LOAD_RETIRED.L3_MISS"],
          d.events["MEM_LOAD_RETIRED.L3_HIT"],
          formatRate(d.events.missRate)
        ];

        d3.select("table")
          .append("tr")
          .attr("class", "row_data")
          .selectAll("td")
          .data(data)
          .enter()
          .append("td")
          .attr("align", (d, i) => (i === 0 ? "left" : "right"))
          .text(d => d);
      }
    });
  }
}

function drawLegend(densityMax, svg) {
  // If the SVG has anything in it, get rid of it. We want a clean slate.
  svg.selectAll("*").remove();

  const sequentialScale = d3.scaleSequential(SPECTRUM).domain([0, densityMax]);

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
