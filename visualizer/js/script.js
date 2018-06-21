// Constants
const { ipcRenderer } = require("electron");
const d3 = require("d3");
const { legendColor } = require("d3-svg-legend");

require("bootstrap");

const ASPECT_RATIO = 9 / 16; // ratio of height-to-width currently, can be changed
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
      return d3.max(timeslices, function(d) {
        return d.numInstructions;
      });
    case "cache": 
      const max = d3.max(timeslices, function(d) {
        return d.events.missRates;
      });
      return max;
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
    .attr("cx", function(d) {
      return xScale(d.totalCycles);
    })
    .attr("cy", function(d) {
      return yScale(d.events.missRates);
    })
    .attr("r", 1)
    .style("fill", function(d) {
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
    .on("brush",  function() { brushed(this, timeslices); })
    .on("end", function() { brushEnd(this, timeslices); });

  brushes.push({id: brushes.length, brush: brush});

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

  if(selection && selection[0] !== selection[1]) {
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
    .attr('id', function(brush) { return 'brush-' + brush.id; })
    .each(function(brushObject) {
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
          function() {
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
    timeslices.forEach(function(d) {
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
    });
  }
}

/* ******************************** color *********************************** */

// Calculates how many points are in this node
function getDensity(node) {
  let count = 1;
  while (node.next) {
    node = node.next;
    count++;
  }
  return count;
}

// // Calculates how many points are in this node
// function getDensity (cur) {
//   if (cur == undefined) {
//     return 0
//   }
//   if (!cur.length) {
//     return 1
//   } else {
//     return (getDensity(cur[0]) + getDensity(cur[1]) + getDensity(cur[2])+ getDensity(cur[3]))
//   }
// }

//Used for finding a data representing the whole node in one unit square
// function findJustOneLeaf(node, check) {
//   if (node !== undefined) {
//     if (!node.length) { // Is a leaf
//       return node
//     } else {
//       const temp = findJustOneLeaf(node[0])
//       if (temp != null) {
//         return temp
//       }
//       temp = findJustOneLeaf(node[1])
//       if (temp != null) {
//         return temp
//       }

//       temp = findJustOneLeaf(node[2])
//       if (temp != null) {
//         return temp
//       }

//       temp = findJustOneLeaf(node[3])
//       if (temp != null) {
//         return temp
//       }
//     }
//   } else {
//     return null
//   }
// }

function position(timeslices, xScale, yScale) {
  for (let i = 0; i < timeslices.length; i++) {
    timeslices[i].x = Math.round(xScale(timeslices[i].totalCycles));
    timeslices[i].y = Math.round(yScale(timeslices[i].events.missRates));
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
        } while ((node = node.next)); // FIX: is there a different way we can do this?
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

//This function will make a array of the density information and the "fake" xAxis and yAxis information
function densityInfo(timeslices, xScale, yScale) {
  //for now, just take in missRates, and InstrustionsAcc
  position(timeslices, xScale, yScale);
  const quadtree = d3.quadtree(
    timeslices,
    function(d) {
      return d.x;
    },
    function(d) {
      return d.y;
    }
  ); //build a quadtree with all datum
  const result = []; //the array used for holding the "picked" datum with their density

  //now go to the depthStd deep node and count the density and record the information to result[]
  quadtree.visit(function(node) {
    if (!node.length) {
      //is a leaf
      if (node.data != null) {
        node.data.density = getDensity(node);
        result.push(node.data);
      }
      return true; // stop traverse
    } else {
      return false;
    }
  });

  calcAverDens(result);
  return result;
}

// //This function will make a array of the density information and the "fake" xAxis and yAxis information
// function densityInfo(timeslices) {//for now, just take in missRates, and InstrustionsAcc
//   const plot = position(timeslices);
//   const quadtree = d3.quadtree(timeslices, function (d) { return d.instructionsAcc; }, function (d) { return d.events.missRates; }); //build a quadtree with all datum
//   const result = []; //the array used for holding the "picked" datum with their density

//   //add depth information into the datum
//   getDepth(quadtree.root(), -1);

//   //making sure that the max depth level goes down to pixels
//   const depthStd = Math.round(Math.log(width * height) / Math.log(4)); //round up!

//   //now go to the depthStd deep node and count the density and record the information to result[]
//   quadtree.visit(function (node, x1, y1, x2, y2) {
//     if (node == undefined) {
//       return true;
//     }
//     if (!node.length) { //is a leaf
//       if (node.data != null) {
//         node.data.density = 1;
//         result.push(data);
//       }
//       return true; //stop traverse
//     } else {
//       if (node.depth < depthStd) {
//         return false; //keep searching the children
//       } else {
//         const density = getDensity(node);
//         const fakeData = findJustOneLeaf(node);
//         fakeData.data.density = density;
//         result.push(fakeData.data);
//         return true;  //stop searching the children
//       }
//     }
//   });
//   return result;
// }

/********************************** legend ********************************** */

function legend(densityMax) {
  const sequentialScale = SPECTRUM
    .domain([0, densityMax]);

  const svg = d3.select("#legend");

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

  svgLegend.select(".legendSequential").call(legendSequential);
}

/***************************** UI to choose xAxis *****************************/
