// Set size and margins of graph
var width = 1500,
  height = 720,
  verticalPad = 60,
  horizontalPad = 100;


// Create an svg object for the graph
var svg = d3.select("#plot")
  .append("svg")
  .attr("width", width)
  .attr("height", height);

var reader = new FileReader();

function loadFile() {
  var file = document.getElementById("data-input").files[0];
  console.log("got here");
  reader.addEventListener("load", parseFile, false);
  if (file) {
    reader.readAsText(file);
  }
}

/* Make sure the graph before drawing (prevents new input getting layered on
    old input) */
svg.selectAll("*").remove();

/* converse the file into the array we use for visualization */
function parseFile() {
  var timeslices = JSON.parse(reader.result).timeslices;
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
    case "cache":
      for (var i = 0; i < timeslices.length; i++) {
        var cur = timeslices[i];
        cur.events.missRates = cur.events.MEM_LOAD_RETIRED.L3_MISS / (cur.events.MEM_LOAD_RETIRED.L3_MISS + MEM_LOAD_RETIRED.L3_HIT);
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
    for (var j = 0; j < cur.events.length; j++) {

    }
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

function drawAxes() {
  // Calculate size of x-axis based on number of data points
  var xAxisMax = findMax(timeslices, chooseXAxis());
  var yAxisMax = findMax(timeslices, chooseResource());

  /* Create functions to scale objects vertically and horizontally according to
  the size of the graph */
  var xScale = d3.scaleLinear().domain([0, xAxisMax]).range([horizontalPad, width - horizontalPad]),
    yScale = d3.scaleLinear().domain([yAxisMax, 0]).range([verticalPad, height - verticalPad]);

  // Create axes and format the ticks on the y-axis as percentages
  var formatAsPercentage = d3.format(".0%");
  var abbrev = d3.format(".0s");
  var xAxis = d3.axisBottom(xScale).tickFormat(abbrev),
    yAxis = d3.axisLeft(yScale).tickFormat(formatAsPercentage);

  // Add the axes to the svg object
  svg.append("g")
    .attr("id", "xAxis")
    .attr("class", "axis")
    .attr("transform", "translate(0, " + (height - verticalPad * 2) + ")")
    .call(xAxis);

  svg.append("g")
    .attr("id", "yAxis")
    .attr("class", "axis")
    .attr("transform", "translate(" + (horizontalPad - verticalPad) + ", 0)")
    .call(yAxis);

  // Add labels to the axes
  svg.select("xAxis")
    .append("text")
    .attr("class", "x label")
    .attr("text-anchor", "end")
    .attr("x", width / 2 + horizontalPad)
    .attr("y", height)
    .text(chooseXAxis());

  svg.select("yAxis")
    .append("text")
    .attr("class", "y label")
    .attr("text-anchor", "end")
    .attr("y", 6)
    .attr("x", -1 * (height - verticalPad) / 2)
    .attr("dy", ".75em")
    .attr("transform", "rotate(-90)")
    .text("Cache miss rate");
}

function scatterPlot(timeslices) {
  categorizeEvents(timeslices, chooseResource());
  drawAxes();

  // Create the points and position them in the graph
  svg.selectAll("circle")
    .data(timeslices)
    .enter()
    .append("circle")
    .attr("cx", function (d) {
      return x(d.numInstructions);
    })
    .attr("cy", function (d, i) {
      return y(d.events.missRates);
    })
    .attr("r", 2);

}
