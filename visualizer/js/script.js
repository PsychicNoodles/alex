// Set size and margins of graph
var width = 700,
  height = 350,
  verticalPad = 20,
  horizontalPad = 100;

// Create an svg object for the graph
var svg = d3
  .select("#plot")
  .append("svg")
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

/* Make sure the graph is clear before drawing (prevents new input getting layered on
    old input) */
svg.selectAll("*").remove();

var timeslices;

/* convert the file into the array we use for visualization */
function parseFile() {
  timeslices = JSON.parse(reader.result).timeslices;
  //densityInfo(timeslices);

  scatterPlot(timeslices);
}

/* Let users choose which resource they want the tool to present and analyze */
function chooseXAxis() {
  //need work!
  return "numInstructions";
}

/* Let users choose which resource they want the tool to present and analyze */
function chooseResource() {
  //need work!
  return "cache";
}

/* This function will take the raw array and a string of the specified resource and categorized them into cache, power, branchPredictor, etc */
function categorizeEvents(timeslices, resource) {
  switch (resource) {
    case "numInstructions":
      timeslices[0].instructionsAcc = timeslices[0].numInstructions;
      timeslices[0].totalCycles = timeslices[0].numCPUCycles;
      for (var i = 1; i < timeslices.length; i++) {
        var cur = timeslices[i];
        cur.totalCycles = cur.numCPUCycles + timeslices[i - 1].totalCycles;
        cur.instructionsAcc = cur.numInstructions + timeslices[i - 1].instructionsAcc;
        cur.selected = false;
      }
    case "cache":
      timeslices[0].totalCycles = timeslices[0].numCPUCycles;
      for (var i = 1; i < timeslices.length; i++) {
        var cur = timeslices[i];
        var total = cur.events["MEM_LOAD_RETIRED.L3_MISS"] + cur.events["MEM_LOAD_RETIRED.L3_HIT"];
        if (total == 0) {
          cur.events.missRates = 0;
        } else {
          cur.events.missRates = cur.events["MEM_LOAD_RETIRED.L3_MISS"] / total;
        }
        cur.totalCycles = cur.numCPUCycles + timeslices[i - 1].totalCycles;
        cur.selected = false;
      }
      break;
    case "power":
      power(timeslices, i);
      break;
    case "branchPredictor":
      branchPredictor(timeslices, i);
      break;
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

var circles;
var brush;

// Re-center brush when the user clicks somewhere in the graph
function brushcentered() {
  var dx = x(1) - x(0), // Use a fixed width when recentering.
      cx = d3.mouse(this)[0],
      x0 = cx - dx / 2,
      x1 = cx + dx / 2;
  d3.select(this.parentNode).call(brush.move, x1 > width ? [width - dx, width] : x0 < 0 ? [0, dx] : [x0, x1]);
}

// Create a table of the points selected by the brush
function createTable() {
  d3.selectAll(".row_data").remove();
  d3.select("table").style("visibility", "visible");

  var circlesSelected = d3.selectAll(".brushed").data();

  if(circlesSelected.length > 0) {
    timeslices.forEach(function(d) {
      if(d.selected) {
        var formatRate = d3.format(".1%");
        var data = [d.totalCycles, d.events["MEM_LOAD_RETIRED.L3_MISS"], d.events["MEM_LOAD_RETIRED.L3_HIT"], formatRate(d.events.missRates)];
      
        d3.select("table")
          .append("tr")
          .attr("class", "row_data")
          .selectAll("td")
          .data(data)
          .enter()
          .append("td")
          .attr("align", (d, i) => i == 0 ? "left" : "right")
          .text(d => d);
      }
    });
  }
}

// Re-color the circles in the region that was selected by the user
function brushed() {
  if(d3.event.selection != null) {
    circles.attr("class", "circle");
    var brushArea = d3.brushSelection(this);

    circles.filter(function () {
      var cx = d3.select(this).attr("cx");
      return brushArea[0] <= cx && cx <= brushArea[1]; 
    })
    .attr("class", "brushed");

    for(var i = 0; i < timeslices.length; i++) {
      timeslices[i].selected = false;
    }
    
    timeslices.map(function (d) {
      if(brushArea[0] <= xScale(d.totalCycles) && xScale(d.totalCycles) <= brushArea[1]) {
        d.selected = true;
      }
    });
  }

}

var x = d3.scaleLinear()
    .domain([0, 10])
    .range([0, width]);

var y = d3.scaleLinear()
    .range([height, 0]);

var xScale, yScale;

function scatterPlot(timeslices) {
  categorizeEvents(timeslices, chooseResource());
  categorizeEvents(timeslices, chooseXAxis());

  // Calculate size of x-axis based on number of data points
  var xAxisMax = timeslices[timeslices.length - 1].totalCycles;
  var yAxisMax = findMax(timeslices, chooseResource());


  // Create functions to scale objects vertically and horizontally according to
    // the size of the graph
  xScale = d3
    .scaleLinear()
    .domain([0, xAxisMax])
    .range([horizontalPad, width - verticalPad]);
  yScale = d3
    .scaleLinear()
    .domain([yAxisMax, 0])
    .range([verticalPad, height - verticalPad * 3]);

  drawAxes(timeslices, xScale, yScale);

  // Create the points and position them in the graph
  circles = svg.selectAll("circle")
    .data(timeslices)
    .enter()
    .append("circle")
    .attr("cx", function (d) {
      // console.log(xScale(d.numInstructions));
      return xScale(d.totalCycles);
    })
    .attr(
      "cy",
      function (d) {
        if (isNaN(yScale(d.events.missRates))) {
          return 0;
        }
        return yScale(d.events.missRates);
      }
    )
    .attr("r", 2);
  
  // Create brush
  brush = d3.brushX()
    .extent([[0, 0], [width, height]])
    .on("brush", brushed)
    .on("end", createTable);

  // Add brush to svg object
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
