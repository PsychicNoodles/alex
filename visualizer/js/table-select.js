const d3 = require("d3");

const { Store } = require("./store");

const TABLES = ["Function Runtimes", "Errors"];

const selectedTableSubscription = d3.local();
const selectedTableStore = new Store(TABLES[0]);

const dropdownIsOpen = d3.local();

function render(root) {
  root.classed("table-select select", true);

  if (root.property(dropdownIsOpen) === undefined) {
    root.property(dropdownIsOpen, false);
  }

  if (root.select(".select__button").empty()) {
    root.append("button").attr("class", "select__button");
  }

  if (root.select(".select__dropdown").empty()) {
    root.append("fieldset").attr("class", "select__dropdown");
  }

  root.classed("select--dropdown-open", root.property(dropdownIsOpen));

  root.select(".select__button").on("click", () => {
    root
      .property(dropdownIsOpen, !root.property(dropdownIsOpen))
      .classed("select--dropdown-open", root.property(dropdownIsOpen));
  });

  const dropdownItemsSelection = root
    .select(".select__dropdown")
    .selectAll(".select__dropdown-item")
    .data(TABLES);

  const dropdownItemsEnterSelection = dropdownItemsSelection
    .enter()
    .append("label")
    .attr("class", "select__dropdown-item");

  dropdownItemsEnterSelection
    .append("input")
    .attr("class", "select__radio")
    .attr("type", "radio")
    .attr("name", "select__radio");

  dropdownItemsEnterSelection
    .append("span")
    .attr("class", "select__name")
    .text(name => name);

  selectedTableStore.subscribeUnique(
    root,
    selectedTableSubscription,
    selectedTable => {
      root.select(".select__button").text(selectedTable);

      dropdownItemsSelection
        .merge(dropdownItemsEnterSelection)
        .each(function(table) {
          d3.select(this)
            .select(".select__radio")
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
