// Set size and margins of graph
var width = 940,
    height = 300,
    pad = 20,
    left_pad = 100;

// Create an svg object for the graph
var svg = d3.select("#plot")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

// Load the data from the JSON file
d3.json("./data/3-objects.json", function(d) {

  // Calculate size of x-axis based on number of data points
  var xAxisRange = d3.max(d, function(d) {
    return d.instruction;
  });

  // Create functions to scale objects vertically and horizontally according to the size of the graph
  var x = d3.scale.linear().domain([0, xAxisRange]).range([left_pad, width - pad]),
      y = d3.scale.linear().domain([1, 0]).range([pad, height - pad * 2]);

  // Create axes and format the ticks on the y-axis as percentages
  var formatAsPercentage = d3.format(".1%");
  var xAxis = d3.svg.axis().scale(x).orient("bottom"),
      yAxis = d3.svg.axis().scale(y).orient("left").tickFormat(formatAsPercentage);

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
    .data(d)
    .enter()
    .append("circle")
    .attr("cx", function(p, i) {
      return x(d[i].instruction);
    })
    .attr("cy", function(p, i) {
      var changeInHit = d[i - 1].hit - d[i].hit;
      var changeInMiss = d[i - 1].miss - d[i].miss;
      return y(changeInMiss / (changeInHit + changeInMiss));
    })
    .attr("r", 1);
  
});
