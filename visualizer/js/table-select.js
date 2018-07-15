const d3 = require("d3");

const { Store } = require("./store");

const TABLES = ["Function Runtimes", "Warnings"];

const selectedTableSubscription = d3.local();
const selectedTableStore = new Store(TABLES[0]);

const dropdownIsOpen = d3.local();

function render(root) {
  root.classed("table-select", true);

  if (root.property(dropdownIsOpen) === undefined) {
    root.property(dropdownIsOpen, false);
  }

  if (root.select(".table-select__button").empty()) {
    root.append("button").attr("class", "table-select__button");
  }

  if (root.select(".table-select__dropdown").empty()) {
    root.append("fieldset").attr("class", "table-select__dropdown");
  }

  root.classed("table-select--dropdown-open", root.property(dropdownIsOpen));

  root.select(".table-select__button").on("click", () => {
    root
      .property(dropdownIsOpen, !root.property(dropdownIsOpen))
      .classed("table-select--dropdown-open", root.property(dropdownIsOpen));
  });

  const dropdownItemsSelection = root
    .select(".table-select__dropdown")
    .selectAll(".table-select__dropdown-item")
    .data(TABLES);

  const dropdownItemsEnterSelection = dropdownItemsSelection
    .enter()
    .append("label")
    .attr("class", "table-select__dropdown-item");

  dropdownItemsEnterSelection
    .append("input")
    .attr("class", "table-select__radio")
    .attr("type", "radio")
    .attr("name", "table-select__radio");

  dropdownItemsEnterSelection
    .append("span")
    .attr("class", "table-select__table-name")
    .text(name => name);

  selectedTableStore.subscribeUnique(
    root,
    selectedTableSubscription,
    selectedTable => {
      root.select(".table-select__button").text(selectedTable);

      dropdownItemsSelection
        .merge(dropdownItemsEnterSelection)
        .each(function(table) {
          d3.select(this)
            .select(".table-select__radio")
            .property("checked", selectedTable === table)
            .on("change", function() {
              // only need to update from the checked radio button
              if (this.checked) {
                selectedTableStore.dispatch(() => table);
              }
            });
        });
    }
  );
}

module.exports = {
  render,
  selectedTableStore
};
