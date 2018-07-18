const d3 = require("d3");

function processData(data) {
  data.map((d, i, arr) => {
    if (i > 0) {
      const a = arr[i - 1].events.core;
      d.events.periodCpu = d.events.core - a;
      const b = arr[i - 1].events.dram;
      d.events.periodMemory = d.events.dram - b;
      const c = arr[i - 1].events["package-0"];
      d.events.periodOverall = d.events["package-0"] - c;
    } else {
      d.events.periodCpu = 0;
      d.events.periodMemory = 0;
      d.events.periodOverall = 0;
    }
  });
  return data
    .filter(
      timeslice =>
        timeslice.cpuTime &&
        timeslice.stackFrames &&
        timeslice.stackFrames.every(sf => sf.address !== "(nil)") &&
        timeslice.pid &&
        timeslice.tid
    )
    .map(timeslice => ({
      ...timeslice,
      stackFrames: timeslice.stackFrames.filter(
        frame => frame.symName !== "(null)"
      )
    }))
    .filter(timeslice => timeslice.stackFrames.length);
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
  const getX = d => xScale(getIndependentVariable(d));
  const getY = d => yScale(getDependentVariable(d));

  // Group together points less than 1 pixel apart into renderableData
  const renderableData = [];
  const overallQuadtree = d3.quadtree(data, getX, getY);
  overallQuadtree.visit((node, x0, y0, x1, y1) => {
    const area = (x1 - x0) * (y1 - y0);
    if ((node.length && area <= 1) || !node.length) {
      const children = getLeafChildren(node);
      const representativeElement =
        children[Math.floor(Math.random() * children.length)];
      const x = getX(representativeElement);
      const y = getY(representativeElement);
      renderableData.push({
        ...representativeElement,
        x,
        y,
        density: children.length
      });

      return true; // Don't visit any children
    } else {
      return false;
    }
  });

  // Build a smaller quadtree from the renderable data and average out the
  // densities
  const DENSITY_AVERAGE_RADIUS = 4;
  const renderableQuadtree = d3.quadtree(renderableData, getX, getY);
  return renderableData.map(renderable => {
    const getDistanceToCenter = (x, y) =>
      Math.sqrt((renderable.x - x) ** 2 + (renderable.y - y) ** 2);

    let count = 0;
    let totalDensity = 0;
    renderableQuadtree.visit((node, x0, y0, x1, y1) => {
      if (node.length) {
        const quadrantCenterX = (x0 + x1) / 2;
        const quadrantCenterY = (y0 + y1) / 2;

        // Find the nearest point on the radius to the center of this quadrant
        const radialDistanceRatio = Math.min(
          DENSITY_AVERAGE_RADIUS /
            getDistanceToCenter(quadrantCenterX, quadrantCenterY),
          1
        );
        const nearestRadialX =
          (quadrantCenterX - renderable.x) * radialDistanceRatio + renderable.x;
        const nearestRadialY =
          (quadrantCenterY - renderable.y) * radialDistanceRatio + renderable.y;

        // Stop traverse if the nearest radial point isn't in this quadrant,
        // meaning the radius doesn't intersect with this quadrant at all.
        return (
          nearestRadialX < x0 ||
          nearestRadialX > x1 ||
          nearestRadialY < y0 ||
          nearestRadialY > y1
        );
      } else {
        const getX = renderableQuadtree.x();
        const getY = renderableQuadtree.y();
        const childrenInRadius = getLeafChildren(node).filter(
          leafNode =>
            getDistanceToCenter(getX(leafNode), getY(leafNode)) <=
            DENSITY_AVERAGE_RADIUS
        );

        count += childrenInRadius.length;
        totalDensity += childrenInRadius
          .map(child => child.density)
          .reduce((a, b) => a + b, 0);

        return true;
      }
    });

    return {
      ...renderable,
      densityAvg: totalDensity / count
    };
  });
}

/**
 * @param {*} node
 * @returns {any[]}
 */
function getLeafChildren(node) {
  if (!node) {
    return [];
  } else if (node.length) {
    return node.reduce(
      (leafChildren, quadrant) =>
        leafChildren.concat(getLeafChildren(quadrant)),
      []
    );
  } else {
    return [node.data, ...getLeafChildren(node.next)];
  }
}

/**
 * Compute the standard deviation (SD) and use it to filter out some outliers.
 * @param {any[]} data
 * @param {(datum: any) => number} getDependentVariable
 * @param {number} sdRange
 */
function sdFilter(data, getDependentVariable, sdRange) {
  const mean = d3.mean(data, getDependentVariable);
  const sd = d3.deviation(data, getDependentVariable);
  return data.filter(
    d => Math.abs(getDependentVariable(d) - mean) < sdRange * sd
  );
}

module.exports = {
  processData,
  computeRenderableData,
  getEventCount,
  sdFilter
};
