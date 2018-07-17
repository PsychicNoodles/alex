/**
 * Create a table of function runtimes
 */

const d3 = require("d3");

function render(root, { functions }) {
  root.classed("function-runtimes", true);

  // console.log(functions);

  root.select(".function-runtimes__header-row").remove();
  const headerRowSelection = root
    .insert("tr", "tr")
    .attr("class", "function-runtimes__header-row");
  headerRowSelection.append("th").text("Function Name");
  headerRowSelection.append("th").text("CPU Time");
  headerRowSelection.append("th").text("Expected Count");
  headerRowSelection.append("th").text("Observed Count");
  headerRowSelection.append("th").text("Probability");

  const tableDataSelection = root
    .selectAll(".function-runtimes__data-row")
    .data(functions.slice(0, 100));

  tableDataSelection
    .enter()
    .append("tr")
    .attr("class", "function-runtimes__data-row")
    .merge(tableDataSelection)
    .each(function({ name, time, expected, observed, probability }) {
      const row = d3
        .select(this)
        .selectAll("td")
        .data([
          name,
          d3.format(".4s")(time),
          expected.toFixed(0),
          observed,
          d3.format(".0%")(probability)
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
