//
// Process the data, but do not draw it.
// Processing mutates the data.
//

const d3 = require("d3");
const { cloneDeep } = require("lodash");

function isInvalidTimeslice(timeslice) {
  return (
    timeslice.cpuTime === 0 ||
    timeslice.stackFrames === undefined ||
    timeslice.stackFrames.length === 0 ||
    timeslice.stackFrames.every(sf => sf.address === "(nil)") ||
    timeslice.pid === 0 ||
    timeslice.tid === 0
  );
}

function processData(immutableData, header) {
  const data = cloneDeep(immutableData);

  // A list of event names
  const hitsEvents = header.presets.cache.hits;
  const missesEvents = header.presets.cache.misses;

  const initialCPUTime = data[0].cpuTime;
  let i = data.length;
  while (i--) {
    const timeslice = data[i];
    if (isInvalidTimeslice(timeslice)) {
      data.splice(i, 1);
      continue;
    }

    // Remove the initial offset from CPU time
    timeslice.cpuTime -= initialCPUTime;

    // Deselect all
    timeslice.selected = false;

    // Convert cache to miss-rate data
    let hitsTotal = 0;
    for (const event of hitsEvents) {
      hitsTotal += timeslice.events[event];
    }

    let missesTotal = 0;
    for (const event of missesEvents) {
      missesTotal += timeslice.events[event];
    }

    const accessesTotal = hitsTotal + missesTotal;
    if (accessesTotal === 0) {
      timeslice.events.missRate = 0;
    } else {
      timeslice.events.missRate = missesTotal / accessesTotal;
    }
  }

  return data;
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

module.exports = { processData, computeRenderableData };
