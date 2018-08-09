const d3 = require("d3");

const { Store } = require("./store");

const tables = [
  { name: "Function Runtimes", id: "#function-runtimes" },
  { name: "Warnings", id: "#warning-list" }
];

const selectedTableSubscription = d3.local();
const selectedTableStore = new Store(tables[0]);

function render(root) {
  root.classed("table-select", true);

  const dropdownItemsSelection = root
    .selectAll(".table-select__option")
    .data(tables);

  const dropdownItemsEnterSelection = dropdownItemsSelection
    .enter()
    .append("label")
    .attr("class", "table-select__option");

  dropdownItemsEnterSelection
    .append("input")
    .attr("class", "table-select__radio")
    .attr("type", "radio")
    .attr("name", "table-select__radio");

  dropdownItemsEnterSelection
    .append("span")
    .attr("class", "table-select__name")
    .text(table => table.name);

  selectedTableStore.subscribeUnique(
    root,
    selectedTableSubscription,
    selectedTable => {
      dropdownItemsSelection
        .merge(dropdownItemsEnterSelection)
        .each(function(table) {
          d3.select(this)
            .select(".table-select__radio")
            .property("checked", selectedTable.id === table.id)
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
