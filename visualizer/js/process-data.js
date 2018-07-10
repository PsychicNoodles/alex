const d3 = require("d3");

function processData(data) {
  return data
    .filter(
      timeslice =>
        timeslice.cpuTime &&
        timeslice.stackFrames &&
        timeslice.stackFrames.length &&
        timeslice.stackFrames.every(sf => sf.address !== "(nil)") &&
        timeslice.pid &&
        timeslice.tid
    )
    .map(timeslice => ({
      ...timeslice,
      stackFrames: timeslice.stackFrames.filter(
        frame => frame.symName !== "(null)"
      )
    }));
}

function getEventCount(timeslice, lowLevelNames) {
  return lowLevelNames.reduce(
    (count, name) => count + timeslice.events[name],
    0
  );
}

function computeRenderableData({
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

module.exports = { processData, computeRenderableData, getEventCount };
