/* ******************************* Require ********************************** */ 
const { ipcRenderer } = require("electron");
const d3 = require("d3");
const { legendColor } = require("d3-svg-legend");
require("bootstrap");

/* ******************************* Globals ********************************** */
const ASPECT_RATIO = 9 / 16;
const SPECTRUM = d3.interpolateGreens;
let widthWithPadding = document.querySelector("#plot").getBoundingClientRect()
  .width;
let heightWithPadding = widthWithPadding * ASPECT_RATIO;
let width = 0.9 * widthWithPadding;
let height = 0.9 * heightWithPadding;
const yAxisLabel = "cache";
const xAxisLabel = "cyclesSoFar";

/* ******************************** Loading ********************************* */
/* This region deals ONLY with the loading of the data. AFTER this, it sends off
the data to be crunched. */
ipcRenderer.send("result-request");
ipcRenderer.on("result", (event, result) => {
  const data = result.timeslices;
  crunch(data);
});

/* ***************************** Data crunching ***************************** */
/* This region deals ONLY with the modification of data. AFTER this, it sends
off the data to be drawn. */
function crunch(data) {
  data = convertXsToCumulative(data);
  data = convertYsToRate(data);
  data = addDensityInfo(data);
  draw(data);
}

// Convert instructions and CPU cycles to be cumulative
function convertXsToCumulative(data) {
  data[0].instructionsSoFar = data[0].numInstructions;
  data[0].cyclesSoFar = data[0].numCPUCycles;
  for (let i = 1; i < data.length; i++) {
    const cur = data[i];
    cur.cyclesSoFar = cur.numCPUCycles + data[i - 1].cyclesSoFar;
    cur.instructionsSoFar =
      cur.numInstructions + data[i - 1].instructionsSoFar;
    cur.selected = false;
  }
  return data;
}

// Convert cache to miss-rate data
function convertYsToRate(data) {
  for (let i = 0; i < data.length; i++) {
    const cur = data[i];
    const total =
      cur.events["MEM_LOAD_RETIRED.L3_MISS"] +
      cur.events["MEM_LOAD_RETIRED.L3_HIT"];
    if (total == 0) {
      cur.events.missRate = 0;
    } else {
      cur.events.missRate = cur.events["MEM_LOAD_RETIRED.L3_MISS"] / total;
    }
    cur.selected = false;
  }
  return data;
}

/* This function will make a array of the density information and the "fake"
xAxis and yAxis information */
function addDensityInfo(data) {
  // For now, just take in missRate, and cyclesSoFar
  const quadtree = d3.quadtree(
    data,
    function (d) {
      return d.cyclesSoFar;
    },
    function (d) {
      return d.events.missRate;
    }
  ); // Build a quadtree with all datum
  const dataWithDensity = [];
  // The array used for holding the "picked" datum with their density

  /* Now go to the depthStd deep node and count the density and record the 
  information to result[] */
  quadtree.visit(function (node) {
    if (!node.length) {
      // Is a leaf
      if (node.data != null) {
        node.data.density = getDensity(node);
        dataWithDensity.push(node.data);
      }
      return true; // Stop traverse
    } else {
      return false;
    }
  });

  calculateAvgDensity(quadtree, dataWithDensity);
  return dataWithDensity;
}

// Calculates how many points are in this node
function getDensity(node) {
  let count = 1;
  while (node.next) {
    node = node.next;
    count++;
  }
  return count;
}

function calculateAvgDensity(quadtree, dataWithDensity) {
  for (let i = 0; i < dataWithDensity.length; i++) {
    const x0 = dataWithDensity[i].x - 2;
    const x3 = dataWithDensity[i].x + 2;
    const y0 = dataWithDensity[i].y - 2;
    const y3 = dataWithDensity[i].y + 2;

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
        } while ((node = node.next));
        // FIX: Is there a different way we can do this? ^
      }
      return x1 >= x3 || y1 >= y3 || x2 <= x0 || y2 <= y0;
    });

    let sum = 0;
    for (let j = 0; j < arr.length; j++) {
      sum += arr[j];
    }

    const avg = sum / arr.length;
    dataWithDensity[i].densityAvg = avg;
  }
}

/* ******************************** Drawing ********************************* */
function draw(data) {
  /* SVG / D3 constructs needed by multiple subfunctions */
  const svg = d3.select("#plot");
  const svgLegend = d3.select("#legend"); // change to be part of main svg
  const xScaleMax = data[data.length - 1].cyclesSoFar;
  const yScaleMax = findMax(data, yAxisLabel);
  const xScale = d3
    .scaleLinear()
    .domain([0, xScaleMax])
    .range([widthWithPadding - width, widthWithPadding]);
  const yScale = d3
    .scaleLinear()
    .domain([yScaleMax, 0])
    .range([0, height]);
  const densityMax = findMax(data, "density");

  /* Actual drawing */
  drawAxes(xScale, yScale, svg);
  const circles = drawPlot(data, xScale, yScale, densityMax, svg, circles);
  drawBrush(data, xScale, svg, circles);
  drawLegend(densityMax, svgLegend);
}

/* This function helps prepare for the scale, finding the max using attr,
a string */
function findMax(timeslices, attr) {
  switch (attr) {
    case "cache": {
      const max = d3.max(timeslices, function (d) {
        return d.events.missRate;
      });
      return max;
    }
    case "density":
      return d3.max(timeslices, function (d) {
        return d.densityAvg;
      });
  }
}

function drawAxes(xScale, yScale, svg) {
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
    .attr("transform", "translate(0, " + height + ")")
    .call(xAxis);

  svg
    .append("g")
    .attr("id", "yAxis")
    .attr("class", "axis")
    .attr("transform", "translate(" + (widthWithPadding - width - 10) + ", 0)")
    .call(yAxis);
  // Add labels to the axes
  svg
    .select("#xAxis")
    .append("text")
    .attr("class", "x label")
    .attr("text-anchor", "middle")
    .attr("x", width / 2 + (widthWithPadding - width))
    .attr("y", heightWithPadding - height)
    .text(xAxisLabel);
  svg
    .select("#yAxis")
    .append("text")
    .attr("class", "y label")
    .attr("text-anchor", "middle")
    .attr("y", height - heightWithPadding)
    .attr("x", -(height / 2))
    .attr("transform", "rotate(-90)")
    .text(yAxisLabel);
}

/* This func makes the scatter plot */
function drawPlot(data, xScale, yScale, densityMax, svg, circles) {
  // Create the points and position them in the graph
  const graph = svg.append("g").attr("id", "graph");

  circles = graph
    .append("g")
    .attr("class", "circles")
    .selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", function(d) {
      return xScale(d.cyclesSoFar);
    })
    .attr("cy", function(d) {
      return yScale(d.events.missRate);
    })
    .attr("r", 1)
    .style("fill", function(d, i) {
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
    .range([widthWithPadding - width, widthWithPadding]);

  // Create brush
  const brush = d3
    .brushX()
    .extent([[0, 0], [widthWithPadding, heightWithPadding - height]])
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
    .call(brush.move, [widthWithPadding - width, widthWithPadding])
    .selectAll(".overlay")
    .attr("width", width)
    .attr("height", height)
    .each(function(d) {
      d.type = "selection";
    })
    .on("mousedown touchstart", function() {
      brushCentered.call(this, brush, x);
    });

  svg
    .select(".graph")
    .select(".brush")
    .select(".selection")
    .attr("height", height);
  svg
    .select(".graph")
    .select(".brush")
    .select(".handle handle--e")
    .attr("height", height);
  svg
    .select(".graph")
    .select(".brush")
    .select(".handle handle--w")
    .attr("height", height);
}

// Re-center brush when the user clicks somewhere in the graph
function brushCentered(brush, x) {
  const dx = x(1) - x(0), // Use a fixed width when recentering.
    cx = d3.mouse(this)[0],
    x0 = cx - dx / 2,
    x1 = cx + dx / 2;
  d3.select(this.parentNode).call(
    brush.move,
    x1 > widthWithPadding ? [widthWithPadding - dx, widthWithPadding] : x0 < 0 ? [0, dx] : [x0, x1]
  );
}

// Re-color the circles in the region that was selected by the user
function brushed(data, xScale, circles) {
  if (d3.event.selection != null) {
    circles.attr("class", "circle");
    const brushArea = d3.brushSelection(this);

    circles
      .filter(function () {
        const cx = d3.select(this).attr("cx");
        return brushArea[0] <= cx && cx <= brushArea[1];
      })
      .attr("class", "brushed");

    for (let i = 0; i < data.length; i++) {
      data[i].selected = false;
    }

    data.map(function (d) {
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
    data.forEach(function(d) {
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

/********************************** Legend ********************************** */
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

/* *************************** UI to choose xAxis *************************** */
// const button = function() {
//   const dispatch = d3.dispatch("press", "release");

//   const padding = 10;

//   function my(selection) {
//     selection.each(function(d, i) {
//       const g = d3
//         .select(this)
//         .attr("id", "d3-button" + i)
//         .attr("transform", "translate(" + 100 + "," + (d.y + 50) + ")");

//       const text = g.append("text").text(d.label);
//       g.append("defs");
//       const bbox = text.node().getBBox();
//       g.insert("rect", "text")
//         .attr("x", bbox.x - padding)
//         .attr("y", bbox.y - padding)
//         .attr("width", bbox.width + 2 * padding)
//         .attr("height", bbox.height + 2 * padding)
//         .on("mouseover", activate)
//         .on("mouseout", deactivate)
//         .on("click", toggle);

//       // addShadow.call(g.node(), d, i);
//       addGradient.call(g.node(), d, i);
//     });
//   }

//   function addGradient(d, i) {
//     const defs = d3.select(this).select("defs");
//     const gradient = defs
//       .append("linearGradient")
//       .attr("id", "gradient" + i)
//       .attr("x1", "0%")
//       .attr("y1", "0%")
//       .attr("x2", "0%")
//       .attr("y2", "100%");

//     gradient
//       .append("stop")
//       .attr("id", "gradient-start")
//       .attr("offset", "0%");

//     gradient
//       .append("stop")
//       .attr("id", "gradient-stop")
//       .attr("offset", "100%");

//     d3.select(this)
//       .select("rect")
//       .attr("fill", "url(#gradient" + i + ")");
//   }

  // function addShadow(d, i) {
  //   let defs = d3.select(this).select("defs");
  //   let rect = d3
  //     .select(this)
  //     .select("rect")
  //     .attr("filter", "url(#dropShadow" + i + ")");
  //   let shadow = defs
  //     .append("filter")
  //     .attr("id", "dropShadow" + i)
  //     .attr("x", rect.attr("x"))
  //     .attr("y", rect.attr("y"))
  //     .attr("width", rect.attr("width") + offsetX)
  //     .attr("height", rect.attr("height") + offsetY);

  //   shadow
  //     .append("feGaussianBlur")
  //     .attr("in", "SourceAlpha")
  //     .attr("stdDeviation", 2);

  //   shadow
  //     .append("feOffset")
  //     .attr("dx", offsetX)
  //     .attr("dy", offsetY);

  //   let merge = shadow.append("feMerge");

  //   merge.append("feMergeNode");
  //   merge.append("feMergeNode").attr("in", "SourceGraphic");
  // }

//   function activate() {
//     const gradient = d3.select(this.parentNode).select("linearGradient");
//     d3.select(this.parentNode)
//       .select("rect")
//       .classed("active", true);
//     if (!gradient.node()) return;
//     gradient.select("#gradient-start").classed("active", true);
//     gradient.select("#gradient-stop").classed("active", true);
//   }

//   function deactivate() {
//     const gradient = d3.select(this.parentNode).select("linearGradient");
//     d3.select(this.parentNode)
//       .select("rect")
//       .classed("active", false);
//     if (!gradient.node()) return;
//     gradient.select("#gradient-start").classed("active", false);
//     gradient.select("#gradient-stop").classed("active", false);
//   }

//   function toggle(d, i) {
//     if (d3.select(this).classed("pressed")) {
//       release.call(this, d, i);
//       deactivate.call(this, d, i);
//     } else {
//       press.call(this, d, i);
//       activate.call(this, d, i);
//     }
//   }

//   function press(d, i) {
//     dispatch.call("press", this, d, i);
//     d3.select(this).classed("pressed", true);
//     // let shadow = d3.select(this.parentNode).select('filter')
//     // if (!shadow.node()) return;
//     // shadow.select('feOffset').attr('dx', 0).attr('dy', 0);
//     // shadow.select('feGaussianBlur').attr('stdDeviation', 0);
//   }

//   function release(d, i) {
//     dispatch.call("release", this, d, i);
//     my.clear.call(this, d, i);
//   }

//   my.clear = function() {
//     d3.select(this).classed("pressed", false);
//     // let shadow = d3.select(this.parentNode).select('filter')
//     // if (!shadow.node()) return;
//     // shadow.select('feOffset').attr('dx', offsetX).attr('dy', offsetY);
//     // shadow.select('feGaussianBlur').attr('stdDeviation', stdDeviation);
//   };

//   my.on = function() {
//     const value = dispatch.on.apply(dispatch, arguments);
//     return value === dispatch ? my : value;
//   };

//   return my;
// };

// const data = [
//   { label: "cyclesSoFar", x: 0, y: 0 },
//   { label: "instructionsSoFar", x: 0, y: 100 }
// ];

// const buttonFunc = button()
//   .on("press", function(d) {
//     clearAll();
//     xAxisLabel = d.label;
//     const densityMax = draw(timeslices);
//     drawLegend(densityMax);
//   })
//   .on("release", function(d, i) {
//     console.log("Released", d, i, this.parentNode);
//   });

// // Add buttons
// const buttons = d3
//   .select("#buttons")
//   .selectAll(".button")
//   .data(data)
//   .enter()
//   .append("g")
//   .attr("class", "button")
//   .call(buttonFunc);

// function clearAll() {
//   buttons.selectAll("rect").each(function(d, i) {
//     buttonFunc.clear.call(this, d, i);
//   });
// }
/* ******************************* Resizing ********************************* */
// FIX: No idea if this should be in here. Might be handled by CSS.
window.addEventListener("resize", resizeChartSVG, false);
function resizeChartSVG() {
  const chartSVG = d3.select("#plot");

  // Calculate the width and height based on the size of the window
  widthWithPadding = document.querySelector("#plot").getBoundingClientRect().width;
  heightWithPadding = widthWithPadding * ASPECT_RATIO;
  chartSVG
    .attr("viewBox", "0 0 " + widthWithPadding + " " + heightWithPadding)
    .attr("width", widthWithPadding)
    .attr("height", heightWithPadding);
  width = 0.9 * widthWithPadding;
  height = 0.9 * heightWithPadding;
}