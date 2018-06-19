//
// Render data to the DOM once it has been processed
//

const d3 = require("d3");
const { legendColor } = require("d3-svg-legend");

const { findMax, PLOT_WIDTH, PLOT_HEIGHT} = require("./util")

module.exports = draw;

const SPECTRUM = d3.interpolateGreens;

function draw(data, xAxisLabel, yAxisLabel) {
  /* SVG / D3 constructs needed by multiple subfunctions */
  const svg = d3.select("#plot");
  const svgLegend = d3.select("#legend"); // change to be part of main svg
  const xScaleMax = data[data.length - 1].cyclesSoFar;
  const yScaleMax = findMax(data, yAxisLabel);
  const xScale = d3
    .scaleLinear()
    .domain([0, xScaleMax])
    .range([0, PLOT_WIDTH]);
  const yScale = d3
    .scaleLinear()
    .domain([yScaleMax, 0])
    .range([0, PLOT_HEIGHT]);
  const densityMax = findMax(data, "density");

  svg.attr("viewBox", `0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`);

  /* Actual drawing */
  const circles = drawPlot(data, xScale, yScale, densityMax, svg);
  drawAxes(xScale, yScale, xAxisLabel, yAxisLabel, svg);
  drawBrush(data, xScale, svg, circles);
  drawLegend(densityMax, svgLegend);
}

function drawAxes(xScale, yScale, xAxisLabel, yAxisLabel, svg) {
  // Create axes and format the ticks
  const formatAsPercentage = d3.format(".0%");
  const abbrev = d3.format(".0s");
  const xAxis = d3.axisBottom(xScale).tickFormat(abbrev);
  const yAxis = d3.axisLeft(yScale).tickFormat(formatAsPercentage);
  // Add the axes to the svg object
  svg
    .append("g")
    .attr("id", "xAxis")
    .attr("class", "axis")
    .attr("transform", "translate(0, " + PLOT_HEIGHT + ")")
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
    .attr("x", PLOT_WIDTH / 2)
    .attr("y", 50)
    .text(xAxisLabel);
  svg
    .select("#yAxis")
    .append("text")
    .attr("class", "y label")
    .attr("text-anchor", "middle")
    .attr("y", -40)
    .attr("x", -(PLOT_HEIGHT / 2))
    .attr("transform", "rotate(-90)")
    .text(yAxisLabel);
}

/* This func makes the scatter plot */
function drawPlot(data, xScale, yScale, densityMax, svg) {
  // Create the points and position them in the graph
  const graph = svg.append("g").attr("id", "graph");

  const circles = graph
    .append("g")
    .attr("class", "circles")
    .selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", d => xScale(d.cyclesSoFar))
    .attr("cy", d => yScale(d.events.missRate))
    .attr("r", 1)
    .style("fill", (d, i) => {
      if (i == 10000) {
        console.log(d.densityAvg);
      }
      return d3.scaleSequential(SPECTRUM)(d.densityAvg / densityMax);
    });
  return circles; // FIX: this is gross
}

function drawBrush(data, xScale, svg, circles) {
  const x = d3
    .scaleLinear()
    .domain([0, 20])
    .range([0, PLOT_WIDTH]);

  // Create brush
  const brush = d3
    .brushX()
    .extent([[0, 0], [PLOT_WIDTH, 0]])
    .on("brush", function() {
      brushed.call(this, data, xScale, circles);
    })
    .on("end", () => createTable(data));

  // Add brush to SVG object
  svg
    .select(".graph")
    .append("g")
    .attr("class", "brush")
    .call(brush)
    .call(brush.move, [0, PLOT_WIDTH])
    .selectAll(".overlay")
    .attr("width", PLOT_WIDTH)
    .attr("height", PLOT_HEIGHT)
    .each(d => {
      d.type = "selection";
    })
    .on("mousedown touchstart", function() {
      brushCentered.call(this, brush, x);
    });

  svg
    .select(".graph")
    .select(".brush")
    .select(".selection")
    .attr("height", PLOT_HEIGHT);
  svg
    .select(".graph")
    .select(".brush")
    .select(".handle handle--e")
    .attr("height", PLOT_HEIGHT);
  svg
    .select(".graph")
    .select(".brush")
    .select(".handle handle--w")
    .attr("height", PLOT_HEIGHT);
}

// Re-center brush when the user clicks somewhere in the graph
function brushCentered(brush, x) {
  const dx = x(1) - x(0), // Use a fixed width when recentering.
    cx = d3.mouse(this)[0],
    x0 = cx - dx / 2,
    x1 = cx + dx / 2;
  d3.select(this.parentNode).call(
    brush.move,
    x1 > PLOT_WIDTH ? [PLOT_WIDTH - dx, PLOT_WIDTH] : x0 < 0 ? [0, dx] : [x0, x1]
  );
}

// Re-color the circles in the region that was selected by the user
function brushed(data, xScale, circles) {
  if (d3.event.selection != null) {
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
          .attr("align", (d, i) => (i == 0 ? "left" : "right"))
          .text(d => d);
      }
    });
  }
}

function drawLegend(densityMax, svg) {
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
