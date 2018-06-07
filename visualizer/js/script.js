// Set size and margins of graph
var width = 600,
    height = 300,
    pad = 20,
    left_pad = 100;

// Create an svg object for the graph
var svg = d3.select("#plot")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

// Load the data from the JSON file
d3.json("./data/percentageTest.json").then(function(results) {

  var dataset = results.timeslices;

  var density = new Array(300);
  for(var i = 0; i < density.length; i++) {
    density[i] = new Array(150);
  }

  // This is the start of an idea of how to handle different types of events, postponed to a later goal
  for(var i = 0; i < dataset.length; i++) {
    var cur = dataset[i];
    for(var j = 0; j < cur.events.length; j++) {
      switch(cur.events[j].name) {
        case "cache":
          cache(dataset, i);
          break;
        case "power":
          power(dataset, i);
          break;
        case "branchPredictor":
          branchPredictor(dataset, i);
          break;
      }
    }
  }

  // Calculate counts and percentages of cache hits and misses and add them to new fields in the array (calculate the first element separately)
  var firstElem = dataset[0];
  firstElem.hitsTotal = firstElem.hits;
  firstElem.missesTotal = firstElem.misses;
  firstElem.hitsPerc = firstElem.hits / (firstElem.misses + firstElem.hits);
  firstElem.missesPerc = firstElem.misses / (firstElem.misses + firstElem.hits);
  
  for(var i = 1; i < dataset.length; i++) {
    var cur = dataset[i];
    cur.hitsTotal = cur.events[0].hits + dataset[i - 1].events[0].hitsTotal;
    cur.missesTotal = cur.events[0].misses + dataset[i - 1].events[0].missesTotal;
    cur.hitsPerc = cur.hits / (cur.misses + cur.hits);
    cur.missesPerc = cur.misses / (cur.misses + cur.hits);
    var yBucket
  }

  // Calculate size of x-axis based on number of data points
  var xAxisRange = d3.max(dataset, function(d) {
    return d.time;
  });

  // Create functions to scale objects vertically and horizontally according to the size of the graph
  var x = d3.scaleLinear().domain([0, xAxisRange]).range([left_pad, width - pad]),
      y = d3.scaleLinear().domain([1, 0]).range([pad, height - pad * 2]);

  // Create axes and format the ticks on the y-axis as percentages
  var formatAsPercentage = d3.format(".0%");
  var xAxis = d3.axisBottom(x),
      yAxis = d3.axisLeft(y).tickFormat(formatAsPercentage);

  // Add the axes to the svg object
  svg.append("g")
    .attr("class", "axis")
    .attr("transform", "translate(0, " + (height - pad) + ")")
    .call(xAxis);
 
  svg.append("g")
    .attr("class", "axis")
    .attr("transform", "translate(" + (left_pad - pad) + ", 0)")
    .call(yAxis);

  // Create the points and position them in the graph
  svg.selectAll("circle")
    .data(dataset)
    .enter()
    .append("circle")
    .attr("cx", function(d) {
      return x(d.time);
    })
    .attr("cy", function(d) {
      return y(d.missesPerc);
    })
    .attr("r", 3);
  
});

// Tests to make sure the switch statement was working
function cache(dataset, i) {
  console.log("In cache function, i: ", i)
}

function power(dataset, i) {
  console.log("In power function, i: ", i)
}

function branchPredictor(dataset, i) {
  console.log("In branchPredictor function, i: ", i)
}
