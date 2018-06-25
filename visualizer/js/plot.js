const d3 = require("d3");

/* This func makes the scatter plot */
function render({ data, densityMax, svg, spectrum }) {
  // Create the points and position them in the plot
  const plot = svg.append("g").attr("id", "plot");

  const circles = plot
    .append("g")
    .attr("class", "circles")
    .selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", 1)
    .style("fill", d =>
      d3.scaleSequential(spectrum)(d.densityAvg / densityMax)
    );
  return circles; // FIX: this is gross
}

function getPlotData({
  data,
  xScale,
  yScale,
  getIndependentVariable,
  getDependentVariable
}) {
  // Round out x and y values
  const getRoundedX = d => Math.round(xScale(getIndependentVariable(d)));
  const getRoundedY = d => Math.round(yScale(getDependentVariable(d)));

  const quadtree = d3.quadtree(data, getRoundedX, getRoundedY);
  const renderableData = [];

  /* Now go to the depthStd deep node and count the density and record the
  information to result[] */
  quadtree.visit(node => {
    if (!node.length) {
      // Is a leaf
      if (node.data !== null) {
        // Calculate how many points are in this node
        let density = 1;
        for (
          let currentNode = node;
          currentNode.next;
          currentNode = currentNode.next
        ) {
          density++;
        }

        renderableData.push({
          ...node.data,
          density,
          x: getRoundedX(node.data),
          y: getRoundedY(node.data)
        });
      }
      return true; // Stop traverse
    } else {
      return false;
    }
  });

  // Calculate average density
  const renderableQuadtree = d3.quadtree(renderableData, d => d.x, d => d.y);
  for (let i = 0; i < renderableData.length; i++) {
    const x0 = renderableData[i].x - 2;
    const x3 = renderableData[i].x + 2;
    const y0 = renderableData[i].y - 2;
    const y3 = renderableData[i].y + 2;

    const arr = [];

    renderableQuadtree.visit((node, x1, y1, x2, y2) => {
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
        // FIX: Is there a different way we can do the above line?
      }
      return x1 >= x3 || y1 >= y3 || x2 <= x0 || y2 <= y0;
    });

    let sum = 0;
    for (let j = 0; j < arr.length; j++) {
      sum += arr[j];
    }

    const avg = sum / arr.length;
    renderableData[i].densityAvg = avg;
  }

  return renderableData;
}

module.exports = { render, getPlotData };