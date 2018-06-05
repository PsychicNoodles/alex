var width = 940,
    height = 300,
    pad = 20,
    left_pad = 100;

var svg = d3.select("#plot")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

var x = d3.scale.linear().domain([0, 4]).range([left_pad, width - pad]),
    y = d3.scale.linear().domain([99, 0]).range([pad, height - pad * 2]);

var xAxis = d3.svg.axis().scale(x).orient("bottom"),
    yAxis = d3.svg.axis().scale(y).orient("left");


svg.append("g")
    .attr("class", "axis")
    .attr("transform", "translate(0, " + (height - pad) + ")")
    .call(xAxis);
 
svg.append("g")
    .attr("class", "axis")
    .attr("transform", "translate(" + (left_pad - pad) + ", 0)")
    .call(yAxis);

d3.json("./js/sample-data.json", function(d) {

  console.log(d[1]);

  svg.selectAll("circle")
    .data(d)
    .enter()
    .append("circle")
    .attr("cx", function(d, i) {
      return d[0].time;
    })
    .attr("cy", function(d, i) {
      return height - (d[1].missRate);
    })
    .attr("r", 3);
  
});
