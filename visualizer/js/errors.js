const d3 = require("d3");

const { Store } = require("./store");

const hiddenErrorsSubscription = d3.local();
const hiddenErrorsStore = new Store([]);

const dropdownIsOpen = d3.local();

function render(root, { errors }) {
  root.classed("errors", true);

  if (root.property(dropdownIsOpen) === undefined) {
    root.property(dropdownIsOpen, false);
  }

  if (root.select(".errors__button").empty()) {
    root.append("button").attr("class", "errors__button");
  }

  if (root.select(".errors__dropdown").empty()) {
    root.append("div").attr("class", "errors__dropdown");
  }

  root.classed("errors--dropdown-open", root.property(dropdownIsOpen));

  root.select(".errors__button").on("click", () => {
    root
      .property(dropdownIsOpen, !root.property(dropdownIsOpen))
      .classed("errors--dropdown-open", root.property(dropdownIsOpen));
  });

  const dropdownItemsSelection = root
    .select(".errors__dropdown")
    .selectAll(".errors__dropdown-item")
    .data(["All Error Types", ...errors]);

  const dropdownItemsEnterSelection = dropdownItemsSelection
    .enter()
    .append("label")
    .attr("class", "errors__dropdown-item");

  dropdownItemsEnterSelection
    .append("input")
    .attr("class", "errors__checkbox")
    .attr("type", "checkbox");

  dropdownItemsEnterSelection
    .append("span")
    .attr("class", "errors__type")
    .text(error => error);

  hiddenErrorsStore.subscribeUnique(
    root,
    hiddenErrorsSubscription,
    hiddenErrors => {
      const showingAllErrors = hiddenErrors.length === 0;
      const showingSomeErrors = errors.some(
        error => !hiddenErrors.includes(error)
      );
      root
        .select(".errors__button")
        .text(
          `Showing ${
            showingAllErrors ? "All" : showingSomeErrors ? "Some" : "No"
          } Error Types`
        );

      dropdownItemsSelection
        .merge(dropdownItemsEnterSelection)
        .each(function(error, i) {
          if (i === 0) {
            // We are on the All checkbox
            d3.select(this)
              .select(".errors__checkbox")
              .property("checked", showingAllErrors)
              .property("indeterminate", showingSomeErrors && !showingAllErrors)
              .on("change", function() {
                if (this.checked) {
                  hiddenErrorsStore.dispatch(() => []);
                } else {
                  hiddenErrorsStore.dispatch(() => errors);
                }
              });
          } else {
            d3.select(this)
              .select(".errors__checkbox")
              .property("checked", !hiddenErrors.includes(error))
              .on("change", function() {
                if (this.checked) {
                  hiddenErrorsStore.dispatch(hiddenErrors =>
                    hiddenErrors.filter(hiddenSource => hiddenSource !== error)
                  );
                } else {
                  hiddenErrorsStore.dispatch(hiddenErrors => [
                    ...hiddenErrors,
                    error
                  ]);
                }
              });
          }
        });
    }
  );
}

module.exports = { render, hiddenErrorsStore };
