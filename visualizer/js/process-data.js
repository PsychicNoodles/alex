const d3 = require("d3");
const { Header, Timeslice, StackFrame, Warning } = require("./protobuf-stream");

function processData(data) {
  const sectionsMap = new Map();
  for (const section in StackFrame.Section) {
    sectionsMap.set(StackFrame.Section[section], section);
  }

  data.map((d, i, arr) => {
    if (i > 0) {
      d.cpuTimeElapsed = d.numCpuTimerTicks / 1000000;
      const a = d.events.core - arr[i - 1].events.core;
      if (a >= 0) {
        d.events.periodCpu = a / d.cpuTimeElapsed;
      }
      const b = d.events.dram - arr[i - 1].events.dram;
      if (b >= 0) {
        d.events.periodMemory = b / d.cpuTimeElapsed;
      }
      const c = d.events["package-0"] - arr[i - 1].events["package-0"];
      if (c >= 0) {
        d.events.periodOverall = c / d.cpuTimeElapsed;
      }
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
      stackFrames: timeslice.stackFrames
        .filter(frame => frame.symbol)
        .map(
          frame =>
            frame.fileName
              ? frame
              : { ...frame, fileName: sectionsMap.get(frame.section) }
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
  // Group together points less than 1 pixel apart into renderableData
  const renderableData = [];
  const overallQuadtree = d3.quadtree(
    data,
    d => xScale(getIndependentVariable(d)),
    d => yScale(getDependentVariable(d))
  );
  overallQuadtree.visit((node, x0, y0, x1, y1) => {
    const area = (x1 - x0) * (y1 - y0);
    if ((node.length && area <= 2) || !node.length) {
      const children = getLeafChildren(node);
      const density = children.length;
      const funcInfo = children.reduce((curFuncInfo, timeslice) => {
        const symbol = timeslice.stackFrames[0].symbol;

        const count = curFuncInfo[symbol]
          ? curFuncInfo[symbol] + 1 / density
          : 1 / density;

        return {
          ...curFuncInfo,
          [symbol]: count
        };
      }, {});

      const representativeElement =
        children[Math.floor(Math.random() * children.length)];
      renderableData.push({
        ...representativeElement,
        x: overallQuadtree.x()(representativeElement),
        y: overallQuadtree.y()(representativeElement),
        density,
        funcInfo
      });

      return true; // Don't visit any children
    } else {
      return false;
    }
  });

  // Build a smaller quadtree from the renderable data and average out the
  // densities
  const DENSITY_AVERAGE_RADIUS = 4;
  const renderableQuadtree = d3.quadtree(renderableData, d => d.x, d => d.y);
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
        const childrenInRadius = getLeafChildren(node).filter(
          leafNode =>
            getDistanceToCenter(leafNode.x, leafNode.y) <=
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

function sdDomain(data, getDependentVariable, sdRange, yScale) {
  const mean = d3.mean(data, getDependentVariable);
  const sd = d3.deviation(data, getDependentVariable);
  return [
    Math.min(mean + sdRange * sd, yScale.domain()[0]),
    Math.max(mean - sdRange * sd, yScale.domain()[1])
  ];
}

module.exports = {
  processData,
  computeRenderableData,
  getEventCount,
  sdFilter,
  sdDomain
};
