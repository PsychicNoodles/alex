const d3 = require("d3");

const ERROR_DESCRIPTIONS = {
  PERF_RECORD_THROTTLE:
    "Too many samples due to the period being too low, try increasing the period",
  PERF_RECORD_UNTHROTTLE: "Period was high enough and decreased back down",
  PERF_RECORD_LOST:
    "Some events were lost, possibly due to the period being too low"
};

const ERROR_VALUES = {
  PERF_RECORD_LOST: "lost"
};

function render(root, { errors }) {
  root.classed("error-list", true);

  root.select(".error-list__header-row").remove();
  const headerRowSelection = root
    .insert("tr", "tr")
    .attr("class", "error-list__header-row");
  headerRowSelection.append("th").text("Type");
  headerRowSelection.append("th").text("Timestamp");
  headerRowSelection.append("th").text("Value");

  const tableDataSelection = root
    .selectAll(".error-list__data-row")
    .data(errors);

  const tableDataSelectionEnter = tableDataSelection
    .enter()
    .append("tr")
    .attr("class", "error-list__data-row")
    .merge(tableDataSelection);

  tableDataSelectionEnter
    .append("td")
    .append("abbr")
    .attr("title", e => ERROR_DESCRIPTIONS[e.type])
    .text(e => e.type);

  tableDataSelectionEnter.append("td").text(e => e.time);

  tableDataSelectionEnter.append("td").text(e => ERROR_VALUES[e.type] || "");

  tableDataSelection.exit().remove();
}

module.exports = { render };
