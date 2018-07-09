/**
 * Create a table of function runtimes
 */

const d3 = require("d3");

const analyze = require("./analysis");

function render(root, { data }) {
  root.classed("function-runtimes", true);

  const functionRuntimesArray = analyze(data).functionList;
  console.log(functionRuntimesArray);

  //const newArray = [...new Set([...functionRuntimesArray, ...(chiSquaredData.functionList)])];
  //console.log(newArray);

  root.select(".function-runtimes__header-row").remove();
  const headerRowSelection = root
    .insert("tr", "tr")
    .attr("class", "function-runtimes__header-row");
  headerRowSelection.append("th").text("Function Name");
  headerRowSelection.append("th").text("Self Time (CPU Time)");
  headerRowSelection.append("th").text("Cumulative Time (CPU Time)");
  headerRowSelection.append("th").text("Expected Count(Rounded)");
  headerRowSelection.append("th").text("Observed Count");

  const tableDataSelection = root
    .selectAll(".function-runtimes__data-row")
    .data(functionRuntimesArray.slice(0, 100));

  tableDataSelection
    .enter()
    .append("tr")
    .attr("class", "function-runtimes__data-row")
    .merge(tableDataSelection)
    .each(function({ name, selfTime, cumulativeTime, expected, observed }) {
      const numberFormatter = d3.format(".4s");
      const row = d3
        .select(this)
        .selectAll("td")
        .data([
          name,
          numberFormatter(selfTime),
          numberFormatter(cumulativeTime),
          expected.toFixed(0),
          observed
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
