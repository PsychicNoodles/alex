const d3 = require("d3");

module.exports = { XAxisSelect };

class XAxisSelect {
  constructor({ onOptionSelect }) {
    this._optionContainers = d3.selectAll(".x-axis-select__option-container");

    this._optionContainers
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

    this._optionContainers.exit().remove();
  }

  set options(newOptions) {
    this._optionContainers.data(newOptions);
  }
}
