// Constants
const { ipcRenderer } = require("electron");
const d3 = require("d3");
const { legendColor } = require("d3-svg-legend");

require("bootstrap");

const ASPECT_RATIO = 9 / 16; // ratio of height-to-width currently, can be changed
const SPECTRUM = d3.scaleSequential(d3.interpolateGreens);

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
let chooseResource = "cache"
let chooseXAxis = "CPUCyclesAcc"


/********************************** LOADING ***********************************/

ipcRenderer.send("result-request");
ipcRenderer.on("result", (event, result) => {
  timeslices = result.timeslices
  // Edit the timeslices array to include information based on which letiables we are graphing
  processData(timeslices, "CPUCyclesAcc");
  processData(timeslices, "instructionsAcc");
  processData(timeslices, chooseResource);
  let densityMax = drawPlot(timeslices);
  legend(densityMax);
});

/* ******************************** DRAWING ********************************* */

/* This takes in timeslices (format specified in wiki) and svg (the plot we want
  to use). It's nice to take svg in as an argument, because if we want to draw
  multiple graphs in the future, we can say which svg should be drawn in. */
function drawPlot(timeslices) {

  svgPlot.selectAll("*").remove();

  // Calculate the width and height based on the size of the window
  plotWidth = document.querySelector("#plot")
    .getBoundingClientRect().width;
  plotHeight = plotWidth * ASPECT_RATIO;
  svgPlot.attr("viewBox", "0 0 " + plotWidth + " " + plotHeight);

  graphWidth = 0.9 * plotWidth;
  graphHeight = 0.9 * plotHeight;

  // Select the svg object of the graph.
  //svgPlot.attr('preserveAspectRatio', 'xMinYMin meet')
  //  .attr('viewBox', '0 0 100 100').attr('preserveAspectRatio', 'xMidYMid meet'); // "none"
  svgPlot.attr('width', plotWidth).attr('height', plotHeight);

  // If the SVG has anything in it, get rid of it. We want a clean slate.
  svgPlot.selectAll("*").remove();



  // Calculate size of x-axis based on number of data points
  const xScaleMax = timeslices[timeslices.length - 1].CPUCyclesAcc;
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
    densityInfo(timeslices, xScale, yScale), xScale, yScale);
  return densityMax;
}



/* This function will take the raw array and a string of a specified property and process the related datum, etc */
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

    case 'CPUCyclesAcc': {
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
    case "cache": {
      const max = d3.max(timeslices, function (d) {
        return d.events.missRates;
      });
      return max;
    }
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
    .attr("x", (graphWidth / 2 + (plotWidth - graphWidth)))
    .attr("y", plotHeight - graphHeight)
    .text(chooseXAxis);

  svg
    .select("#yAxis")
    .append("text")
    .attr("class", "y label")
    .attr("text-anchor", "middle")
    .attr("y", graphHeight - plotHeight)
    .attr("x", -(graphHeight / 2))
    //.attr("dy", ".75em")
    .attr("transform", "rotate(-90)")
    .text(chooseResource);
}

/* This func makes the scatter plot */
function scatterPlot(simplifiedData, xScale, yScale) {
  const densityMax = findMax(simplifiedData, "density");

  // Create the points and position them in the graph
  let graph = svgPlot
    .append("svg")
    .attr("class", "graph")
    ;

  circles = graph
    .append("g")
    .attr("class", "circles")
    .selectAll("circle")
    .data(simplifiedData)
    .enter()
    .append("circle")
    .attr("cx", function (d) {
      return xScale(d.CPUCyclesAcc);
    })
    .attr("cy", function (d) {
      return yScale(d.events.missRates);
    })
    .attr("r", 1)
    .style("fill", function (d, i) {
      if (i == 10000) {
        console.log(d.densityAver)
        return d3.scaleSequential(d3.interpolateGreens)(d.densityAver / densityMax);
      }
      
      return d3.scaleSequential(d3.interpolateGreens)(d.densityAver / densityMax);
    });



  createBrush(simplifiedData);

  return densityMax;
}

/**********************Brush Brush Brush******************************* */
function createBrush(timeslices) {
  const x = d3
    .scaleLinear()
    .domain([0, 20])
    .range([plotWidth - graphWidth, plotWidth]);

  // Create brush
  const brush = d3
    .brushX()
    .extent([[0, 0], [plotWidth, plotHeight - graphHeight]])
    .on("brush", function () {
      brushed.call(this, timeslices);
    })
    .on("end", () => createTable(timeslices));

  // Add brush to svg object
  svgPlot
    .select(".graph")
    .append("g")
    .attr("class", "brush")
    .call(brush)
    .call(brush.move, [plotWidth - graphWidth, plotWidth])
    .selectAll(".overlay")
    .attr("width", graphWidth)
    .attr("height", graphHeight)
    .each(function (d) {
      d.type = "selection";
    })
    .on("mousedown touchstart", function () {
      brushCentered.call(this, brush, x);
    });

  svgPlot.select(".graph").select(".brush").select(".selection").attr("height", graphHeight)
  svgPlot.select(".graph").select(".brush").select(".handle handle--e").attr("height", graphHeight)
  svgPlot.select(".graph").select(".brush").select(".handle handle--w").attr("height", graphHeight)
}

// Re-center brush when the user clicks somewhere in the graph
function brushCentered(brush, x) {
  const dx = x(1) - x(0), // Use a fixed width when recentering.
    cx = d3.mouse(this)[0],
    x0 = cx - dx / 2,
    x1 = cx + dx / 2;
  d3.select(this.parentNode).call(
    brush.move,
    x1 > plotWidth ? [plotWidth - dx, plotWidth] : x0 < 0 ? [0, dx] : [x0, x1]
  );
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
          d.CPUCyclesAcc,
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

// Re-color the circles in the region that was selected by the user
function brushed(timeslices) {
  if (d3.event.selection != null) {
    circles.attr("class", "circle");
    const brushArea = d3.brushSelection(this);

    circles
      .filter(function () {
        const cx = d3.select(this).attr("cx");
        return brushArea[0] <= cx && cx <= brushArea[1];
      })
      .attr("class", "brushed");

    for (let i = 0; i < timeslices.length; i++) {
      timeslices[i].selected = false;
    }

    timeslices.map(function (d) {
      if (
        brushArea[0] <= xScale(d.CPUCyclesAcc) &&
        xScale(d.CPUCyclesAcc) <= brushArea[1]
      ) {
        d.selected = true;
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
    timeslices[i].x = Math.round(xScale(timeslices[i].CPUCyclesAcc)); //need to be more generic
    timeslices[i].y = Math.round(yScale(timeslices[i].events.missRates)); //need to be more generic
  }
}

function calcAverDens(result) {
  const quadtree = d3.quadtree(
    result,
    function (d) {
      return d.x;
    },
    function (d) {
      return d.y;
    }
  );
  for (let i = 0; i < result.length; i++) {
    const x0 = result[i].x - 2;
    const x3 = result[i].x + 2;
    const y0 = result[i].y - 2;
    const y3 = result[i].y + 2;

    const arr = [];

    quadtree.visit(function (node, x1, y1, x2, y2) {
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
  //for now, just take in missRates, and CPUCyclesAcc
  position(timeslices, xScale, yScale);
  const quadtree = d3.quadtree(
    timeslices,
    function (d) {
      return d.x;
    },
    function (d) {
      return d.y;
    }
  ); //build a quadtree with all datum
  const result = []; //the array used for holding the "picked" datum with their density

  //now go to the depthStd deep node and count the density and record the information to result[]
  quadtree.visit(function (node) {
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

/***************************** UI to choose xAxis *****************************/

let button = function () {

  let dispatch = d3.dispatch('press', 'release');

  let padding = 10

  function my(selection) {
    selection.each(function (d, i) {
      let g = d3.select(this)
        .attr('id', 'd3-button' + i)
        .attr('transform', 'translate(' + 100 + ',' + (d.y + 50) + ')');

      let text = g.append('text').text(d.label);
      g.append('defs');
      let bbox = text.node().getBBox();
      g.insert('rect', 'text')
        .attr("x", bbox.x - padding)
        .attr("y", bbox.y - padding)
        .attr("width", bbox.width + 2 * padding)
        .attr("height", bbox.height + 2 * padding)
        .on('mouseover', activate)
        .on('mouseout', deactivate)
        .on('click', toggle)

      //addShadow.call(g.node(), d, i);
      addGradient.call(g.node(), d, i);
    });
  }

  function addGradient(d, i) {
    let defs = d3.select(this).select('defs');
    let gradient = defs.append('linearGradient')
      .attr('id', 'gradient' + i)
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    gradient.append('stop')
      .attr('id', 'gradient-start')
      .attr('offset', '0%')

    gradient.append('stop')
      .attr('id', 'gradient-stop')
      .attr('offset', '100%')

    d3.select(this).select('rect').attr('fill', 'url(#gradient' + i + ")");
  }

  // function addShadow(d, i) {
  //     let defs = d3.select(this).select('defs');
  //     let rect = d3.select(this).select('rect').attr('filter', 'url(#dropShadow' + i + ")");
  //     let shadow = defs.append('filter')
  //       .attr('id', 'dropShadow' + i)
  //       .attr('x', rect.attr('x'))
  //       .attr('y', rect.attr('y'))
  //       .attr('width', rect.attr('width') + offsetX)
  //       .attr('height', rect.attr('height') + offsetY)

  //     shadow.append('feGaussianBlur')
  //       .attr('in', 'SourceAlpha')
  //       .attr('stdDeviation', 2)

  //     shadow.append('feOffset')
  //       .attr('dx', offsetX)
  //       .attr('dy', offsetY);

  //     let merge = shadow.append('feMerge');

  //     merge.append('feMergeNode');
  //     merge.append('feMergeNode').attr('in', 'SourceGraphic');
  // }

  function activate() {
    let gradient = d3.select(this.parentNode).select('linearGradient')
    d3.select(this.parentNode).select("rect").classed('active', true)
    if (!gradient.node()) return;
    gradient.select('#gradient-start').classed('active', true)
    gradient.select('#gradient-stop').classed('active', true)
  }

  function deactivate() {
    let gradient = d3.select(this.parentNode).select('linearGradient')
    d3.select(this.parentNode).select("rect").classed('active', false)
    if (!gradient.node()) return;
    gradient.select('#gradient-start').classed('active', false);
    gradient.select('#gradient-stop').classed('active', false);
  }

  function toggle(d, i) {
    if (d3.select(this).classed('pressed')) {
      release.call(this, d, i);
      deactivate.call(this, d, i);
    } else {
      press.call(this, d, i);
      activate.call(this, d, i);
    }
  }

  function press(d, i) {
    dispatch.call('press', this, d, i)
    d3.select(this).classed('pressed', true);
    // let shadow = d3.select(this.parentNode).select('filter')
    // if (!shadow.node()) return;
    // shadow.select('feOffset').attr('dx', 0).attr('dy', 0);
    // shadow.select('feGaussianBlur').attr('stdDeviation', 0);
  }

  function release(d, i) {
    dispatch.call('release', this, d, i)
    my.clear.call(this, d, i);
  }

  my.clear = function () {
    d3.select(this).classed('pressed', false);
    // let shadow = d3.select(this.parentNode).select('filter')
    // if (!shadow.node()) return;
    // shadow.select('feOffset').attr('dx', offsetX).attr('dy', offsetY);
    // shadow.select('feGaussianBlur').attr('stdDeviation', stdDeviation);
  }

  my.on = function () {
    let value = dispatch.on.apply(dispatch, arguments);
    return value === dispatch ? my : value;
  };

  return my;
}

let data = [{ label: "CPUCyclesAcc", x: 0, y: 0 },
{ label: "instructionsAcc", x: 0, y: 100 }];

let buttonFunc = button()
  .on('press', function (d) {
    clearAll();
    chooseXAxis = d.label
    let densityMax = drawPlot(timeslices);
    legend(densityMax);

  })
  .on('release', function (d, i) { console.log("Released", d, i, this.parentNode) });

// Add buttons
let buttons = d3.select("#buttons").selectAll('.button')
  .data(data)
  .enter()
  .append('g')
  .attr('class', 'button')
  .call(buttonFunc);

function clearAll() {
  buttons.selectAll('rect')
    .each(function (d, i) { buttonFunc.clear.call(this, d, i) });
}

