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

/*const ASPECT_RATIO = 9 / 16; // ratio of height-to-width currently, can be changed
const SPECTRUM = d3.scaleSequential(d3.interpolateGreens);

let circles;
let xScale;
let yScale;

let plotWidth;
let plotHeight;
let graphWidth;
let graphHeight;
let svgPlot = d3.select("#plot");
let svgLegend = d3.select("#legend");

var gBrushes = svgPlot.append('g')
  .attr("class", "brushes");
var brushes = [];

/********************************** LOADING ***********************************/

ipcRenderer.send("result-request");
ipcRenderer.on("result", (event, result) => {
  let densityMax = drawPlot(result.timeslices);
  legend(densityMax);
});

/* ******************************** DRAWING ********************************* */

/* This takes in timeslices (format specified in wiki) and svg (the plot we want
  to use). It's nice to take svg in as an argument, because if we want to draw
  multiple graphs in the future, we can say which svg should be drawn in. */
function drawPlot(timeslices) {
  // Calculate the width and height based on the size of the window
  plotWidth = document.querySelector("#plot")
    .getBoundingClientRect().width;
  plotHeight = plotWidth * ASPECT_RATIO;
  graphWidth = 0.9 * plotWidth;
  graphHeight = 0.9 * plotHeight;

  // Select the svg object of the graph.
  //svgPlot.attr('preserveAspectRatio', 'xMinYMin meet')
  //  .attr('viewBox', '0 0 100 100').attr('preserveAspectRatio', 'xMidYMid meet'); // "none"
  svgPlot.attr('width', plotWidth).attr('height', plotHeight);

  // If the SVG has anything in it, get rid of it. We want a clean slate.
  svgPlot.selectAll("*").remove();

  // Edit the timeslices array to include information based on which letiables we are graphing
  processData(timeslices, chooseResource());
  processData(timeslices, chooseXAxis());

  // Calculate size of x-axis based on number of data points
  const xScaleMax = timeslices[timeslices.length - 1].totalCycles;
  const yScaleMax = findMax(timeslices, chooseResource());

  /* Create functions to scale objects vertically and horizontally according to
  the size of the graph */
  xScale = d3
    .scaleLinear()
    .domain([0, xScaleMax])
    .range([plotWidth - graphWidth, plotWidth]);
  yScale = d3
    .scaleLinear()
    .domain([yScaleMax, 0])
    .range([0, graphHeight]);

  drawAxes(xScale, yScale);
  const densityMax = scatterPlot(
    densityInfo(timeslices, xScale, yScale),
    xScale,
    yScale
  );
  return densityMax;
}

/* Lets users choose which letiable they want on the x-axis */
function chooseXAxis() {
  // need work!
  return "numInstructions";
}

/* Lets users choose which resource they want the tool to present on the y-axis */
function chooseResource() {
  // need work!
  return "cache";
}

/* This function will take the raw array and a string of a specified property and process the related datum, etc */
function processData(timeslices, resource) {
  switch (resource) {
    case "numInstructions":
      timeslices[0].instructionsAcc = timeslices[0].numInstructions;
      timeslices[0].totalCycles = timeslices[0].numCPUCycles;
      for (let i = 1; i < timeslices.length; i++) {
        const cur = timeslices[i];
        cur.totalCycles = cur.numCPUCycles + timeslices[i - 1].totalCycles;
        cur.instructionsAcc =
          cur.numInstructions + timeslices[i - 1].instructionsAcc;
        cur.selected = false;
      }
      break;
    case "cache": {
      timeslices[0].totalCycles = timeslices[0].numCPUCycles;
      let total =
        timeslices[0].events["MEM_LOAD_RETIRED.L3_MISS"] +
        timeslices[0].events["MEM_LOAD_RETIRED.L3_HIT"];
      if (total == 0) {
        timeslices[0].missRates = 0;
      } else {
        timeslices[0].missRates =
          timeslices[0].events["MEM_LOAD_RETIRED.L3_MISS"] / total;
      }
      for (let i = 1; i < timeslices.length; i++) {
        let cur = timeslices[i];
        total =
          cur.events["MEM_LOAD_RETIRED.L3_MISS"] +
          cur.events["MEM_LOAD_RETIRED.L3_HIT"];
        if (total == 0) {
          cur.events.missRates = 0;
        } else {
          cur.events.missRates = cur.events["MEM_LOAD_RETIRED.L3_MISS"] / total;
        }
        cur.totalCycles = cur.numCPUCycles + timeslices[i - 1].totalCycles;
        cur.selected = false;
      }
      break;
    }
    case "power":
      // power(timeslices, i)
      break;
    case "branchPredictor":
      // branchPredictor(timeslices, i)
      break;
  }
}

/* This function helps prepare for the scale, finding the max using attr, a string */
function findMax(timeslices, attr) {
  switch (attr) {
    case "numInstructions":
      return d3.max(timeslices, function (d) {
        return d.numInstructions;
      });
    case "cache":
      const max = d3.max(timeslices, function (d) {
        return d.events.missRates;
      });
      return max;
    case "density":
      return d3.max(timeslices, function (d) {
        return d.densityAver;
      });
  }
}

function drawAxes(xScale, yScale) {
  // Create axes and format the ticks
  const formatAsPercentage = d3.format(".0%");
  const abbrev = d3.format(".0s");
  const xAxis = d3.axisBottom(xScale).tickFormat(abbrev);
  const yAxis = d3.axisLeft(yScale).tickFormat(formatAsPercentage);
  const svg = d3.select("#plot");

  // Add the axes to the svg object
  svgPlot
    .append("g")
    .attr("id", "xAxis")
    .attr("class", "axis")
    .attr("transform", "translate(0, " + graphHeight + ")")
    .call(xAxis);

  svgPlot
    .append("g")
    .attr("id", "yAxis")
    .attr("class", "axis")
    .attr("transform", "translate(" + ((plotWidth - graphWidth) - 10) + ", 0)")
    .call(yAxis);

  // Add labels to the axes
  svg
    .select("#xAxis")
    .append("text")
    .attr("class", "x label")
    .attr("text-anchor", "middle")
    .attr("x", (graphWidth / 2) + (plotWidth - graphWidth))
    .attr("y", graphHeight + ((plotHeight - graphHeight) / 2))
    .text("CPU Cycles");

  svg
    .select("#yAxis")
    .append("text")
    .attr("class", "y label")
    .attr("text-anchor", "middle")
    .attr("y", (plotWidth - graphWidth) / 2)
    .attr("x", graphHeight / 2)
    .attr("dy", ".75em")
    .attr("transform", "rotate(-90)")
    .text("Cache miss rate");
}

/* This func makes the scatter plot */
function scatterPlot(simplifiedData, xScale, yScale) {
  const densityMax = findMax(simplifiedData, "density");

  // Create the points and position them in the graph
  circles = svgPlot
    .selectAll("circle")
    .data(simplifiedData)
    .enter()
    .append("circle")
    .attr("cx", function (d) {
      return xScale(d.totalCycles);
    })
    .attr("cy", function (d) {
      return yScale(d.events.missRates);
    })
    .attr("r", 1)
    .style("fill", function (d) {
      return SPECTRUM(d.densityAver / densityMax);
    });

  createBrush(simplifiedData);
  drawBrushes();

  return densityMax;
}

/**********************Brush Brush Brush******************************* */
function createBrush(timeslices) {
  const x = d3
    .scaleLinear()
    .domain([0, 10])
    .range([plotWidth - graphWidth, plotWidth]);

  // Create brush
  var brush = d3
    .brushX()
    .extent([[plotWidth - graphWidth, 0], [plotWidth, graphHeight]])
    .on("start", function () { brushed(this, timeslices); })
    .on("brush", function () { brushed(this, timeslices); })
    .on("end", function () { brushEnd(this, timeslices); });

  brushes.push({ id: brushes.length, brush: brush });

  //Add brush to svg object
  //svgPlot
  //  .append("g")
  //  .attr("class", "brush")
  //  .attr('id', 'brush-' + (brushes.length - 1))
  //  .call(brush);
  //.selectAll(".overlay");
}

function brushEnd(context, timeslices) {
  createTable(timeslices);
  var lastBrushId = brushes[brushes.length - 1].id;
  var lastBrush = document.getElementById('brush-' + lastBrushId);
  var selection = d3.brushSelection(lastBrush);

  if (selection && selection[0] !== selection[1]) {
    createBrush(timeslices);
  }

  drawBrushes(context);
}

function drawBrushes(context) {
  var brushSelection = gBrushes
    .selectAll('brush')
    .data(brushes);

  brushSelection.exit()
    .remove();

  // brushSelection.enter()
  //   .insert("g", '.brush')
  //   .attr('class', 'brush')
  //   .attr('id', function(brush) { return 'brush-' + brush.id; })
  //   .each(function(brushObject) {
  //     brushObject.brush(d3.select(context));
  //   });

  brushSelection.enter().append('brush')
    //.attr('class', 'brush')
    .merge(brushSelection)
    .attr('id', function (brush) { return 'brush-' + brush.id; })
    .each(function (brushObject) {
      brushObject.brush(d3.select(context));
    });

  console.log("data: ", brushSelection.data());
  console.log("brushes: ", brushes);

  //console.log("last brush: ", brushes[brushes.length]);

  brushSelection
    .each(function (brushObject) {
      d3.select(context)
        .attr('class', 'brush')
        .selectAll('.overlay')
        .style('pointer-events',
          function () {
            var brush = brushObject.brush;
            //console.log("brush: ", brushObject);
            //console.log("id: " + brushObject.id + ", length: " + brushes.length);
            if (brushObject.id === brushes.length - 1 && brush != undefined) {
              //console.log("true");
              return 'all';
            } else {
              //console.log("false");
              return 'none';
            }
          });
    })
}

// Re-color the circles in the region that was selected by the user
function brushed(context, timeslices) {
  if (d3.event.selection != null) {
    circles.attr("class", "circle");
    const brushArea = d3.brushSelection(context);

    circles
      .filter(function () {
        const cx = d3.select(context).attr("cx");
        return brushArea[0] <= cx && cx <= brushArea[1];
      })
      .attr("class", "brushed");

    for (let i = 0; i < timeslices.length; i++) {
      timeslices[i].selected = false;
    }

    timeslices.map(function (d) {
      if (brushArea[0] <= xScale(d.totalCycles) && xScale(d.totalCycles) <= brushArea[1]) {
        d.selected = true;
      }
    });
  }
}

// Create a table of the points selected by the brush
function createTable(timeslices) {
  d3.selectAll(".row_data").remove();
  d3.select("table").style("visibility", "visible");

  const circlesSelected = d3.selectAll(".brushed").data();

  if (circlesSelected.length > 0) {
    timeslices.forEach(function (d) {
      if (d.selected) {
        const formatRate = d3.format(".1%");
        const data = [
          d.totalCycles,
          d.events["MEM_LOAD_RETIRED.L3_MISS"],
          d.events["MEM_LOAD_RETIRED.L3_HIT"],
          formatRate(d.events.missRates)
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
    });*/
