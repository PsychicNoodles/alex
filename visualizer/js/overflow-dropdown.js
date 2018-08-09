const d3 = require("d3");

const dropdownIsOpen = d3.local();

/**
 * @param {d3.Selection} root
 */
function render(root) {
  if (root.property(dropdownIsOpen) === undefined) {
    root.property(dropdownIsOpen, false);
  }

  root
    .classed("overflow-dropdown dropdown", true)
    .classed("dropdown--open", root.property(dropdownIsOpen));

  if (root.select(".dropdown__button").empty()) {
    root
      .append("button")
      .attr("class", "dropdown__button")
      .append("i")
      .attr("class", "overflow-dropdown__icon material-icons")
      .text("more_vert");
  }

  if (root.select(".overflow-dropdown__items").empty()) {
    throw new Error(
      "overflow-dropdown must have .overflow-dropdown__items as a child."
    );
  }

  root.select(".overflow-dropdown__items").classed("dropdown__content", true);

  root.selectAll(".overflow-dropdown__item").classed("dropdown__item", true);

  root.select(".dropdown__button").on("click", () => {
    root
      .property(dropdownIsOpen, !root.property(dropdownIsOpen))
      .classed("dropdown--open", root.property(dropdownIsOpen));
  });
}

module.exports = { render };
