// Constants
const { ipcRenderer } = require("electron");
const d3 = require("d3");
const { legendColor } = require("d3-svg-legend");

require("bootstrap");

const ASPECT_RATIO = 9 / 16;
const SPECTRUM = d3.interpolateGreens;

let timeslices;

let circles;
let xScale;
let yScale;

let plotWidth;
let plotHeight;
let graphWidth;
let graphHeight;
let svgPlot = d3.select("#plot");
let svgLegend = d3.select("#legend");
let chooseResource = "cache";
let chooseXAxis = "CPUCyclesAcc";

/* ******************************** Loading ********************************* */
ipcRenderer.send("result-request");
ipcRenderer.on("result", (event, result) => {
  timeslices = result.timeslices;
  /* Edit the timeslices array to include information based on which letiables
  we are graphing */
  processData(timeslices, "CPUCyclesAcc");
  processData(timeslices, "instructionsAcc");
  processData(timeslices, chooseResource);
  let densityMax = drawPlot(timeslices);
  legend(densityMax);
});

/* ******************************** Drawing ********************************* */
/* This takes in timeslices (format specified in wiki) and svg (the plot we want
  to use). It's nice to take svg in as an argument, because if we want to draw
  multiple graphs in the future, we can say which svg should be drawn in. */
function drawPlot(timeslices) {
  // If the SVG has anything in it, get rid of it. We want a clean slate.
  svgPlot.selectAll("*").remove();

  // Calculate the width and height based on the size of the window
  plotWidth = document.querySelector("#plot").getBoundingClientRect().width;
  plotHeight = plotWidth * ASPECT_RATIO;
  svgPlot
    .attr("viewBox", "0 0 " + plotWidth + " " + plotHeight)
    .attr("width", plotWidth)
    .attr("height", plotHeight);
  graphWidth = 0.9 * plotWidth;
  graphHeight = 0.9 * plotHeight;

  // Calculate size of x-axis based on number of data points
  const xScaleMax = ("CPUCyclesAcc" == chooseXAxis ? timeslices[timeslices.length - 1].CPUCyclesAcc : timeslices[timeslices.length - 1].instructionsAcc);
  const yScaleMax = findMax(timeslices, chooseResource);

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

/* This function will take the raw array and a string of a specified property
and process the related datum, etc */
function processData(timeslices, label) {
  switch (label) {
    case "instructionsAcc":
      timeslices[0].instructionsAcc = timeslices[0].numInstructions;
      timeslices[0].CPUCyclesAcc = timeslices[0].numCPUCycles;
      for (let i = 1; i < timeslices.length; i++) {
        const cur = timeslices[i];
        cur.CPUCyclesAcc = cur.numCPUCycles + timeslices[i - 1].CPUCyclesAcc;
        cur.instructionsAcc =
          cur.numInstructions + timeslices[i - 1].instructionsAcc;
        cur.selected = false;
      }
      break;

    case "CPUCyclesAcc": {
      timeslices[0].CPUCyclesAcc = timeslices[0].numCPUCycles;
      for (let i = 1; i < timeslices.length; i++) {
        let cur = timeslices[i];
        cur.CPUCyclesAcc = cur.numCPUCycles + timeslices[i - 1].CPUCyclesAcc;
      }
      break;
    }
    case "cache": {
      for (let i = 0; i < timeslices.length; i++) {
        let cur = timeslices[i];
        let total =
          cur.events["MEM_LOAD_RETIRED.L3_MISS"] +
          cur.events["MEM_LOAD_RETIRED.L3_HIT"];
        if (total == 0) {
          cur.events.missRates = 0;
        } else {
          cur.events.missRates = cur.events["MEM_LOAD_RETIRED.L3_MISS"] / total;
        }
        cur.selected = false;
      }
      break;
    }
  }
}

/* This function helps prepare for the scale, finding the max using attr,
a string */
function findMax(timeslices, attr) {
  switch (attr) {
    case "cache": {
      const max = d3.max(timeslices, function(d) {
        return d.events.missRates;
      });
      return max;
    }
    case "density":
      return d3.max(timeslices, function(d) {
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
    .attr("transform", "translate(" + (plotWidth - graphWidth - 10) + ", 0)")
    .call(yAxis);

  // Add labels to the axes
  svg
    .select("#xAxis")
    .append("text")
    .attr("class", "x label")
    .attr("text-anchor", "middle")
    .attr("x", graphWidth / 2 + (plotWidth - graphWidth))
    .attr("y", plotHeight - graphHeight)
    .text(chooseXAxis);

  svg
    .select("#yAxis")
    .append("text")
    .attr("class", "y label")
    .attr("text-anchor", "middle")
    .attr("y", graphHeight - plotHeight)
    .attr("x", -(graphHeight / 2))
    .attr("transform", "rotate(-90)")
    .text(chooseResource);
}

/* This func makes the scatter plot */
function scatterPlot(simplifiedData, xScale, yScale) {
  const densityMax = findMax(simplifiedData, "density");

  // Create the points and position them in the graph
  let graph = svgPlot.append("svg").attr("class", "graph");

  circles = graph
    .append("g")
    .attr("class", "circles")
    .selectAll("circle")
    .data(simplifiedData)
    .enter()
    .append("circle")
    .attr("cx", function(d) {
      let val = (chooseXAxis == "CPUCyclesAcc" ? d.CPUCyclesAcc : d.instructionsAcc);
      return xScale(val);
    })
    .attr("cy", function(d) {
      return yScale(d.events.missRates);
    })
    .attr("r", 1)
    .style("fill", function(d, i) {
      return d3.scaleSequential(SPECTRUM)(d.densityAver / densityMax);
    });

  return densityMax;
}

/* ********************************** Brush ********************************* */


/* *************************** Density coloring ***************************** */
// Calculates how many points are in this node
function getDensity(node) {
  let count = 1;
  while (node.next) {
    node = node.next;
    count++;
  }
  return count;
}

function position(timeslices, xScale, yScale) {
  for (let i = 0; i < timeslices.length; i++) {
    timeslices[i].x = Math.round(xScale(chooseXAxis == "CPUCyclesAcc" ? timeslices[i].CPUCyclesAcc : timeslices[i].instructionsAcc));
    // needs to be more generic
    timeslices[i].y = Math.round(yScale(timeslices[i].events.missRates));
    // needs to be more generic
  }
}

function calcAverDens(result) {
  const quadtree = d3.quadtree(
    result,
    function(d) {
      return d.x;
    },
    function(d) {
      return d.y;
    }
  );
  for (let i = 0; i < result.length; i++) {
    const x0 = result[i].x - 2;
    const x3 = result[i].x + 2;
    const y0 = result[i].y - 2;
    const y3 = result[i].y + 2;

    const arr = [];

    quadtree.visit(function(node, x1, y1, x2, y2) {
      if (!node.length) {
        do {
          if (
            node.data.x >= x0 &&
            node.data.x <= x3 &&
            node.data.y >= y0 &&
            node.data.y <= y3
          ) {
            arr.push(node.data.density);
          }
        } while ((node = node.next));
        // FIX: Is there a different way we can do this? ^ //i think this is a clever way?
      }
      return x1 >= x3 || y1 >= y3 || x2 <= x0 || y2 <= y0;
    });

    let sum = 0;
    for (let j = 0; j < arr.length; j++) {
      sum += arr[j];
    }

    const aver = sum / arr.length;
    result[i].densityAver = aver;
  }
}

/* This function will make a array of the density information and the "fake"
xAxis and yAxis information */
function densityInfo(timeslices, xScale, yScale) {
  // For now, just take in missRates, and CPUCyclesAcc
  position(timeslices, xScale, yScale);
  let quadtree = d3.quadtree(
    timeslices,
    function(d) {
      return d.x;
    },
    function(d) {
      return d.y;
    }
  ); // Build a quadtree with all datum
  let result = [];
  // The array used for holding the "picked" datum with their density

  /* Now go to the depthStd deep node and count the density and record the 
  information to result[] */
  quadtree.visit(function(node) {
    if (!node.length) {
      // Is a leaf
      if (node.data != null) {
        node.data.density = getDensity(node);
        result.push(node.data);
      }
      return true; // Stop traverse
    } else {
      return false;
    }
  });

  calcAverDens(result);
  return result;
}

/********************************** Legend ********************************** */
function legend(densityMax) {
  // If the SVG has anything in it, get rid of it. We want a clean slate.
  svgLegend.selectAll("*").remove();
  const sequentialScale = d3.scaleSequential(SPECTRUM).domain([0, densityMax]);

  svgLegend
    .append("g")
    .attr("class", "legendSequential")
    .attr("transform", "translate(0,30)");

  const legendSequential = legendColor()
    .title("Density")
    .cells(6)
    .orient("vertical")
    .ascending(true)
    .scale(sequentialScale);

  svgLegend.select(".legendSequential").call(legendSequential);
}

/* *************************** UI to choose xAxis *************************** */
let button = function() {
  function my(selection) {
    selection.each(function(d, i) {
      let label = d3
        .select(this)
        .text(d);

      let input = label.append("input")
        .attr("type", "radio")
        .attr("name", "radio")
        .attr("value", d)
        ;

      label.append("span")
      .attr("class","checkmark");

    });
  }
  return my;
};

let data = ["CPUCyclesAcc","instructionsAcc"];

let buttonFunc = button()
  ;

// Add buttons
let buttons = d3
  .select("#buttons")
  .selectAll(".container")
  .data(data)
  .enter()
  .append("label")
  .attr("class", "container")
  .call(buttonFunc);


  document.querySelector("#buttons").addEventListener("change",function(event) {
    chooseXAxis = event.target.value;
    let densityMax = drawPlot(timeslices);
    legend(densityMax);
  })
