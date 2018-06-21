const d3 = require("d3");

const xAxisOptions = [
  {
    independentVariable: "cyclesSoFar",
    label: "CPU Cycles"
  },
  {
    independentVariable: "instructionsSoFar",
    label: "Instructions Executed"
  }
];

module.exports = { onXAxisSelect, renderXAxisSelect };

function onXAxisSelect(callback) {
  d3.selectAll(".x-axis-select__option-container input")
    .on("change", callback)
    .filter(":checked")
    .each(callback);
}

function renderXAxisSelect() {
  d3.select(".x-axis-select")
    .selectAll(".x-axis-select__option-container")
    .remove()
    .data(xAxisOptions)
    .enter()
    .append("label")
    .attr("class", "x-axis-select__option-container")
    .each(function(data, index) {
      const label = d3.select(this).text(data.label);

      const input = label
        .append("input")
        .attr("type", "radio")
        .attr("name", "xAxis")
        .attr("value", data.independentVariable);

      if (index === 0) {
        input.attr("checked", "");
      }

      label.append("span").attr("class", "x-axis-select__option-checkbox");
    });
}
