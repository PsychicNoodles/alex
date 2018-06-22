const d3 = require("d3");

/**
 * Create a table of function runtimes
 */
function renderFunctionRuntimes(root, { data }) {
  const functionRuntimesMap = {};
  for (const timeSlice of data) {
    if (timeSlice.selected) {
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
            timeSlice.numCPUCycles;
          if (+i === 0) {
            functionRuntimesMap[functionName].selfTime +=
              timeSlice.numCPUCycles;
          }
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

  root.select(".function-runtimes__header-row").remove();
  const headerRowSelection = root
    .insert("tr", "tr")
    .attr("class", "function-runtimes__header-row");
  headerRowSelection.append("th").text("Function Name");
  headerRowSelection.append("th").text(`Self Time (CPU Cycles)`);
  headerRowSelection.append("th").text(`Cumulative Time (CPU Cycles)`);

  const tableDataSelection = root
    .selectAll(".function-runtimes__data-row")
    .data(functionRuntimesArray.slice(0, 100));

  tableDataSelection
    .enter()
    .append("tr")
    .attr("class", "function-runtimes__data-row")
    .merge(tableDataSelection)
    .each(function({ name, selfTime, cumulativeTime }) {
      const row = d3.select(this);
      row.selectAll("td").remove();
      row.append("td").text(name);

      const numberFormatter = d3.format(".4s");
      row.append("td").text(numberFormatter(selfTime));
      row.append("td").text(numberFormatter(cumulativeTime));
    });

  tableDataSelection.exit().remove();
}

module.exports = { renderFunctionRuntimes };
