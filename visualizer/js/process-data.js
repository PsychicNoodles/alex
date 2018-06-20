//
// Process the data, but do not draw it.
// Processing mutates the data.
//

const d3 = require("d3");
const { cloneDeep } = require("lodash");

const { CHART_WIDTH, CHART_HEIGHT } = require("./util");

module.exports = processData;

function processData(
  immutableData,
  getIndependentVariable,
  getDependentVariable
) {
  const data = cloneDeep(immutableData);

  // Accumulate cycles and instructions
  data[0].cyclesSoFar = data[0].numCPUCycles;
  data[0].instructionsSoFar = data[0].numInstructions;
  for (let i = 1; i < data.length; i++) {
    const cur = data[i];
    cur.cyclesSoFar = cur.numCPUCycles + data[i - 1].cyclesSoFar;
    cur.instructionsSoFar = cur.numInstructions + data[i - 1].instructionsSoFar;
    cur.selected = false;
  }

  // Convert cache to miss-rate data
  for (let i = 0; i < data.length; i++) {
    const cur = data[i];
    const total =
      cur.events["MEM_LOAD_RETIRED.L3_MISS"] +
      cur.events["MEM_LOAD_RETIRED.L3_HIT"];
    if (total === 0) {
      cur.events.missRate = 0;
    } else {
      cur.events.missRate = cur.events["MEM_LOAD_RETIRED.L3_MISS"] / total;
    }
    cur.selected = false;
  }

  // Scale and round all the points so that points that would share a pixel have
  // the exact same x and y values
  const xScaleMax = getIndependentVariable(data[data.length - 1]);
  const yScaleMax = d3.max(data, getDependentVariable);
  const xScale = d3
    .scaleLinear()
    .domain([0, xScaleMax])
    .range([0, CHART_WIDTH]);
  const yScale = d3
    .scaleLinear()
    .domain([yScaleMax, 0])
    .range([0, CHART_HEIGHT]);

  // NOTE: no idea why we do this but nothing else works ??? wut??? do you mean the part below?
  for (let i = 0; i < data.length; i++) {
    data[i].x = Math.round(xScale(getIndependentVariable(data[i])));
    // needs to be more generic
    data[i].y = Math.round(yScale(getDependentVariable(data[i])));
    // needs to be more generic
  }

  const quadtree = d3.quadtree(data, d => d.x, d => d.y); // Build a quadtree with all datum
  const dataWithDensity = [];
  // The array used for holding the "picked" datum with their density

  /* Now go to the depthStd deep node and count the density and record the
  information to result[] */
  quadtree.visit(node => {
    if (!node.length) {
      // Is a leaf
      if (node.data !== null) {
        // Calculate how many points are in this node
        node.data.density = 1;
        for (
          let currentNode = node;
          currentNode.next;
          currentNode = currentNode.next
        ) {
          node.data.density++;
        }

        dataWithDensity.push(node.data);
      }
      return true; // Stop traverse
    } else {
      return false;
    }
  });

  // Calculate average density
  const quadtreeWithDensity = d3.quadtree(dataWithDensity, d => d.x, d => d.y);
  for (let i = 0; i < dataWithDensity.length; i++) {
    const x0 = dataWithDensity[i].x - 2;
    const x3 = dataWithDensity[i].x + 2;
    const y0 = dataWithDensity[i].y - 2;
    const y3 = dataWithDensity[i].y + 2;

    const arr = [];

    quadtreeWithDensity.visit((node, x1, y1, x2, y2) => {
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
    dataWithDensity[i].densityAvg = avg;
  }

  return dataWithDensity;
}
