var width = 940,
    height = 300,
    pad = 20,
    left_pad = 100;

var svg = d3.select("#plot")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

d3.json("./js/sample-data.json", function(d) {

  var xAxisRange = d3.max(d, function(d) {
    return d.time;
  });

  var x = d3.scale.linear().domain([0, xAxisRange]).range([left_pad, width - pad]),
      y = d3.scale.linear().domain([1, 0]).range([pad, height - pad * 2]);

  var formatAsPercentage = d3.format(".1%");
  var xAxis = d3.svg.axis().scale(x).orient("bottom"),
      yAxis = d3.svg.axis().scale(y).orient("left").tickFormat(formatAsPercentage);


  svg.append("g")
    .attr("class", "axis")
    .attr("transform", "translate(0, " + (height - pad) + ")")
    .call(xAxis);
 
  svg.append("g")
    .attr("class", "axis")
    .attr("transform", "translate(" + (left_pad - pad) + ", 0)")
    .call(yAxis);

  

  for (var i = 0; i < d.length; i++) {
    console.log(d[i]);
  };

  svg.selectAll("circle")
    .data(d)
    .enter()
    .append("circle")
    .attr("cx", function(p, i) {
      var temp = x(d[i].time);
      console.log("x value: ");
      console.log(temp);
      console.log("i: " + i);
      return temp;
    })
    .attr("cy", function(p, i) {
      var temp = y(d[i].missRate);
      console.log(temp);
      return temp;
    })
    .attr("r", 3);
  
});
