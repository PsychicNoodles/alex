/**
 * Create a table of function runtimes
 */

const d3 = require("d3");

const chiSquaredTest = require("./analysis");
function render(root, { data }) {
  const selected = data.filter(d => d.selected);
  const functionRuntimesMap = {};
  for (const timeSlice of selected) {
    for (const i in timeSlice.stackFrames) {
      const functionName = timeSlice.stackFrames[i].name;
      if (functionName !== "(null)") {
        functionRuntimesMap[functionName] = functionRuntimesMap[
          functionName
        ] || {
          selfTime: 0,
          cumulativeTime: 0
        };
        functionRuntimesMap[functionName].cumulativeTime +=
          timeSlice.numCPUTimerTicks;
        if (+i === 0) {
          functionRuntimesMap[functionName].selfTime +=
            timeSlice.numCPUTimerTicks;
        }
      }
    }
  }

  const functionRuntimesArray = [];
  for (const functionName in functionRuntimesMap) {
    functionRuntimesArray.push({
      ...functionRuntimesMap[functionName],
      name: functionName
    });
  }

  functionRuntimesArray.sort((a, b) => {
    if (a.selfTime === b.selfTime) {
      return b.cumulativeTime - a.cumulativeTime;
    } else {
      return b.selfTime - a.selfTime;
    }
  });

  const chiSquaredData = chiSquaredTest(data);
  const probability = chiSquaredData.probability;
  const probabilityPercentage = (probability * 100).toFixed(3);
  if (chiSquaredData !== -1) {
    console.log(
      `The likelihood that your selection is unusual is ~${probabilityPercentage}%`
    );
    console.log(chiSquaredData.functionList);
  }

  root.select(".function-runtimes__header-row").remove();
  const headerRowSelection = root
    .insert("tr", "tr")
    .attr("class", "function-runtimes__header-row");
  headerRowSelection.append("th").text("Function Name");
  headerRowSelection.append("th").text("Self Time (CPU Time)");
  headerRowSelection.append("th").text("Cumulative Time (CPU Time)");

  const tableDataSelection = root
    .selectAll(".function-runtimes__data-row")
    .data(functionRuntimesArray.slice(0, 100));

  tableDataSelection
    .enter()
    .append("tr")
    .attr("class", "function-runtimes__data-row")
    .merge(tableDataSelection)
    .each(function({ name, selfTime, cumulativeTime }) {
      const numberFormatter = d3.format(".4s");
      const row = d3
        .select(this)
        .selectAll("td")
        .data([
          name,
          numberFormatter(selfTime),
          numberFormatter(cumulativeTime)
        ]);

      row
        .enter()
        .append("td")
        .merge(row)
        .text(text => text);

      row.exit().remove();
    });

  tableDataSelection.exit().remove();
}

module.exports = { render };
