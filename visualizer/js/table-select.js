const d3 = require("d3");

const { Store } = require("./store");

const tables = [
  { name: "Function Runtimes", id: "#function-runtimes" },
  { name: "Warnings", id: "#warning-list" }
];

const selectedTableSubscription = d3.local();
const selectedTableStore = new Store(tables[0]);

const dropdownIsOpen = d3.local();

function render(root) {
  root.classed("table-select dropdown", true);

  if (root.property(dropdownIsOpen) === undefined) {
    root.property(dropdownIsOpen, false);
  }

  if (root.select(".dropdown__button").empty()) {
    root.append("button").attr("class", "dropdown__button");
  }

  if (root.select(".dropdown__content").empty()) {
    root.append("fieldset").attr("class", "dropdown__content");
  }

  const setDropdownIsOpen = isOpen => {
    root.property(dropdownIsOpen, isOpen).classed("dropdown--open", isOpen);
  };

  setDropdownIsOpen(root.property(dropdownIsOpen));

  root.select(".dropdown__button").on("click", () => {
    setDropdownIsOpen(!root.property(dropdownIsOpen));
  });

  const dropdownItemsSelection = root
    .select(".dropdown__content")
    .selectAll(".dropdown__item")
    .data(tables);

  const dropdownItemsEnterSelection = dropdownItemsSelection
    .enter()
    .append("label")
    .attr("class", "dropdown__item");

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
      root.select(".dropdown__button").text(selectedTable.name);

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

              setDropdownIsOpen(false);
            });
        });
    }
  );
}

module.exports = {
  render,
  selectedTableStore
};
