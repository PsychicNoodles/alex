// Set size and margins of graph
var width = 1500,
    height = 720,
    pad = 20,
    left_pad = 100;

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

function parseFile() {
  var data = JSON.parse(reader.result);
  dataCrunch(data);
}

function dataCrunch(results) {

  /* Make sure the graph before drawing (prevents new input getting layered on
    old input) */
  svg.selectAll("*").remove();

  var timeslices = results.timeslices;
  console.log(timeslices.length);

  // This is the start of an idea of how to handle different types of events, postponed to a later goal
  for(var i = 0; i < timeslices.length; i++) {
    var cur = timeslices[i];
    for(var j = 0; j < cur.events.length; j++) {
      switch(cur.events[j].name) {
        case "cache":
          cache(timeslices, i);
          break;
        case "power":
          power(timeslices, i);
          break;
        case "branchPredictor":
          branchPredictor(timeslices, i);
          break;
      }
    }
  }

  var missRates = new Array(timeslices.length);

  // Calculate counts and percentages of cache hits and misses and add them to new fields in the array (calculate the first element separately)
  var firstElem = timeslices[0];

  // From old data format, could be useful as reference
  //firstElem.hitsTotal = firstElem.hits;
  //firstElem.missesTotal = firstElem.misses;
  //firstElem.hitsPerc = firstElem.hits / (firstElem.misses + firstElem.hits);
  //firstElem.missesPerc = firstElem.misses / (firstElem.misses + firstElem.hits);
  
  for(var i = 0; i < timeslices.length; i++) {
    var cur = timeslices[i];
    missRates[i] = cur.events[0].count / (cur.events[0].count + cur.events[1].count);

    // From old data format, could be useful as reference
    //cur.hitsTotal = cur.events[0].hits + timeslices[i - 1].events[0].hitsTotal;
    //cur.missesTotal = cur.events[0].misses + timeslices[i - 1].events[0].missesTotal;
    //cur.hitsPerc = cur.hits / (cur.misses + cur.hits);
    //cur.missesPerc = cur.misses / (cur.misses + cur.hits);
  }

  // Calculate size of x-axis based on number of data points
  var xAxisRange = d3.max(timeslices, function(d) {
    return d.numInstructions;
  });

  /* Create functions to scale objects vertically and horizontally according to
  the size of the graph */
  var x = d3.scaleLinear().domain([0, xAxisRange]).range([left_pad, width - pad]),
      y = d3.scaleLinear().domain([1, 0]).range([pad, height - pad * 3]);

  // Create axes and format the ticks on the y-axis as percentages
  var formatAsPercentage = d3.format(".0%");
  var abbrev = d3.format(".0s");
  var xAxis = d3.axisBottom(x).tickFormat(abbrev),
      yAxis = d3.axisLeft(y).tickFormat(formatAsPercentage);

  // Add the axes to the svg object
  svg.append("g")
    .attr("class", "axis")
    .attr("transform", "translate(0, " + (height - pad * 2) + ")")
    .call(xAxis);

  svg.append("g")
    .attr("class", "axis")
    .attr("transform", "translate(" + (left_pad - pad) + ", 0)")
    .call(yAxis);

  // Add labels to the axes
  svg.append("text")
    .attr("class", "x label")
    .attr("text-anchor", "end")
    .attr("x", width / 2 + left_pad)
    .attr("y", height)
    .text("Instructions");

  svg.append("text")
    .attr("class", "y label")
    .attr("text-anchor", "end")
    .attr("y", 6)
    .attr("x", -1 * (height - pad) / 2)
    .attr("dy", ".75em")
    .attr("transform", "rotate(-90)")
    .text("Cache miss rate");

  // Create the points and position them in the graph
  svg.selectAll("circle")
    .data(timeslices)
    .enter()
    .append("circle")
    .attr("cx", function(d) {
      return x(d.numInstructions);
    })
    .attr("cy", function(d, i) {
      return y(missRates[i]);
    })
    .attr("r", 2);
  
};

// Tests to make sure the switch statement was working
function cache(timeslices, i) {
  console.log("In cache function, i: ", i)
}

function power(timeslices, i) {
  console.log("In power function, i: ", i)
}

function branchPredictor(timeslices, i) {
  console.log("In branchPredictor function, i: ", i)
}
