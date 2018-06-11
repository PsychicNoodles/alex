// Set size and margins of graph
var width = d3.select("#plot").attr("width"),
  height = d3.select("#plot").attr("height"),
  verticalPad = 20,
  horizontalPad = 100;

// Create an svg object for the graph
var svg = d3
  .select("#plot")
  .attr("width", width)
  .attr("height", height);

var reader = new FileReader();

function loadFile() {
  var file = document.getElementById("data-input").files[0];
  reader.addEventListener("load", parseFile, false);
  if (file) {
    reader.readAsText(file);
  }
}

/* converse the file into the array we use for visualization */
function parseFile() {
  var timeslices = JSON.parse(reader.result).timeslices;
  /* Make sure the graph is empty before drawing (prevents new input getting
  layered on old input) */
  svg.selectAll("*").remove();
  //densityInfo(timeslices);
  scatterPlot(timeslices);
}

/*Lets users to choose which resource they want the tool to present and analyze on */
function chooseXAxis() {
  //need work!
  return "numInstructions";
}

/*Lets users to choose which resource they want the tool to present and analyze on */
function chooseResource() {
  //need work!
  return "cache";
}

/* This function will take the raw array and a string of the specified resource and categorized them into cache, power, branchPredictor, etc */
function categorizeEvents(timeslices, resourse) {
  switch (resourse) {
    case "numInstructions":
      timeslices[0].instructionsAcc = timeslices[0].numInstructions;
      for (var i = 1; i < timeslices.length; i++) {
        var cur = timeslices[i];
        cur.instructionsAcc =
          cur.numInstructions + timeslices[i - 1].instructionsAcc;
      }
    case "cache":
      for (var i = 0; i < timeslices.length; i++) {
        var cur = timeslices[i];
        var total =
          cur.events["MEM_LOAD_RETIRED.L3_MISS"] +
          cur.events["MEM_LOAD_RETIRED.L3_HIT"];
        if (total == 0) {
          cur.events.missRates = 0;
        } else {
          cur.events.missRates = cur.events["MEM_LOAD_RETIRED.L3_MISS"] / total;
        }
      }
      break;
    case "power":
      power(timeslices, i);
      break;
    case "branchPredictor":
      branchPredictor(timeslices, i);
      break;
  }

  for (var i = 0; i < timeslices.length; i++) {
    var cur = timeslices[i];
    for (var j = 0; j < cur.events.length; j++) { }
  }
}

function findMax(timeslices, attr) {
  switch (attr) {
    case "numInstructions":
      return d3.max(timeslices, function (d) {
        return d.numInstructions;
      });
    case "cache":
      return 1;
  }
}

function drawAxes(timeslices, xScale, yScale) {
  // Create axes and format the ticks on the y-axis as percentages
  var formatAsPercentage = d3.format(".0%");
  var abbrev = d3.format(".0s");
  var xAxis = d3.axisBottom(xScale).tickFormat(abbrev),
    yAxis = d3.axisLeft(yScale).tickFormat(formatAsPercentage);

  // Add the axes to the svg object
  svg
    .append("g")
    .attr("id", "xAxis")
    .attr("class", "axis")
    .attr("transform", "translate(0, " + (height - verticalPad * 2) + ")")
    .call(xAxis);

  svg
    .append("g")
    .attr("id", "yAxis")
    .attr("class", "axis")
    .attr("transform", "translate(" + (horizontalPad - verticalPad) + ", 0)")
    .call(yAxis);

  // Add labels to the axes
  svg
    .select("xAxis")
    .append("text")
    .attr("class", "x label")
    .attr("text-anchor", "end")
    .attr("x", width / 2 + horizontalPad)
    .attr("y", height)
    .text(chooseXAxis());

  svg
    .select("yAxis")
    .append("text")
    .attr("class", "y label")
    .attr("text-anchor", "end")
    .attr("y", 6)
    .attr("x", (-1 * (height - verticalPad)) / 2)
    .attr("dy", ".75em")
    .attr("transform", "rotate(-90)")
    .text("Cache miss rate");
}





function scatterPlot(timeslices) {
  categorizeEvents(timeslices, chooseResource());
  categorizeEvents(timeslices, chooseXAxis());

  // Calculate size of x-axis based on number of data points
  var xAxisMax = timeslices[timeslices.length - 1].instructionsAcc;
  var yAxisMax = findMax(timeslices, chooseResource());

  /* Create functions to scale objects vertically and horizontally according to
  the size of the graph */
  var xScale = d3
    .scaleLinear()
    .domain([0, xAxisMax])
    .range([horizontalPad, width - verticalPad]),
    yScale = d3
      .scaleLinear()
      .domain([yAxisMax, 0])
      .range([verticalPad, height - verticalPad * 3]);

  drawAxes(timeslices, xScale, yScale);

  // Create the points and position them in the graph
  svg
    .selectAll("circle")
    .data(timeslices)
    .enter()
    .append("circle")
    .attr("cx", function (d) {
      // console.log(xScale(d.numInstructions));
      return xScale(d.instructionsAcc);
    })
    .attr(
      "cy",

      function (d) {
        if (isNaN(yScale(d.events.missRates))) {
          console.log("XXXXXXXX ", d.numInstructions);
        }
        return yScale(d.events.missRates);
      }
    )

    .attr("r", 2);
  





/******************************************* selector selector selector************************************************************/
// Re-center brush when the user clicks somewhere in the graph
function brushcentered() {
  var dx = x(1) - x(0), // Use a fixed width when recentering.
      cx = d3.mouse(this)[0],
      x0 = cx - dx / 2,
      x1 = cx + dx / 2;
  d3.select(this.parentNode).call(brush.move, x1 > width ? [width - dx, width] : x0 < 0 ? [0, dx] : [x0, x1]);
}

// Select the region that was selected by the user
function brushed() {
  var extent = d3.event.selection.map(x.invert, x);
  circle.classed("selected", function(d) { return extent[0] <= d[0] && d[0] <= extent[1]; });
}

var x = d3.scaleLinear()
    .domain([0, 10])
    .range([0, width]);

var y = d3.scaleLinear()
    .range([height, 0]);

var circle;

// Creates brush
  var brush = d3.brushX()
    .extent([[0, 0], [width, height]])
    .on("start brush", brushed);

  // Adds brush to svg object
  svg.append("g")
    .attr("class", "brush")
    .call(d3.brush().on("brush", brushed));

  svg.append("g")
      .call(brush)
      .call(brush.move, [3, 5].map(x))
    .selectAll(".overlay")
      .each(function(d) { d.type = "selection"; })
      .on("mousedown touchstart", brushcentered);

}



function quadTreeX(d) {
  return d.instructionsAcc;
}

function quadTreeY(d) {
  return d.events.missRates;
}

// PDS Collect a list of nodes to draw rectangles, adding extent and depth data
function nodes(quadtree) {
  var nodes = [];
  quadtree.depth = 0; // root
  quadtree.visit(function (node, x1, y1, x2, y2) {
    node.x1 = x1;
    node.y1 = y1;
    node.x2 = x2;
    node.y2 = y2;
    nodes.push(node);
    var i = 0
    for (; i < nodes.length; i++) {
      if (nodes[i]) {
        nodes[i].depth = node.depth + 1;
      }
    }
  });
  return true;
}


/*************************************** coloring coloring coloring ************************************************************* */
//This function calculate how many points are in this node
function getDensity(cur, density) {
  if (!cur.length) {
    if (cur.data != null) {
    return 1;
    } else return 0;
  } else {
    return (getDensity(cur[0]) + getDensity(cur[1]) + getDensity(cur[2]) + getDensity(cur[3]));
  }

}

//This function will make a array of the density information and the "fake" xAxis and yAxis information
function densityInfo(timeslices) {//for now, just take in missRates, and InstrustionsAcc
  var quadtree = d3.quadtree(timeslices, quadTreeX, quadTreeY); //build a quadtree with all datum
  var result = [];
  var singles = [];

  //add depth information into the datum
  nodes(quadtree);

  var depthStd = Math.round(Math.log(width * height) / Math.log(4));

  //now go to the depthStd deep node and count the density and record the information to result[]
  quadtree.visit(function (node, x1, y1, x2, y2) {
    if (node.depth < depthStd) {
      //for those records own a single pixel, push them into a array for singles. (I am soooooo jealous!)
      if (!node.length) {
        singles.push(node.data);
        return true;
      } else return false; // if is not leave, search its kids
    }
    else { //we reach the unitSquare!
      node.data.density = getDensity(node, 0);
      result.push(node.data);
    }
  });
  console.log(result);
}
