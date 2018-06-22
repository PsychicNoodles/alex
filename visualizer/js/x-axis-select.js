const d3 = require("d3");

function renderXAxisSelect(root, { onOptionSelect, options }) {
  const optionContainers = root
    .selectAll(".x-axis-select__option-container")
    .data(options);

  optionContainers
    .enter()
    .append("label")
    .attr("class", "x-axis-select__option-container")
    .each(function(data, index) {
      const label = d3.select(this).text(data.label);

      const input = label
        .append("input")
        .attr("type", "radio")
        .attr("name", "xAxis")
        .attr("value", data.independentVariable)
        .on("change", onOptionSelect);

      if (index === 0) {
        input.attr("checked", "").each(onOptionSelect);
      }

      label.append("span").attr("class", "x-axis-select__option-checkbox");
    });

  optionContainers.exit().remove();
}

module.exports = { renderXAxisSelect };
