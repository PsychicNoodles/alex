const d3 = require("d3");

const { Store } = require("./store");

const hiddenSourcesSubscription = d3.local();
const hiddenSourcesStore = new Store([]);

const dropdownIsOpen = d3.local();

function render(root, { sources }) {
  root.classed("source-select select", true);

  if (root.property(dropdownIsOpen) === undefined) {
    root.property(dropdownIsOpen, false);
  }

  if (root.select(".select__button").empty()) {
    root.append("button").attr("class", "select__button");
  }

  if (root.select(".select__dropdown").empty()) {
    root.append("div").attr("class", "select__dropdown");
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
    .data(["All Sources", ...sources]);

  const dropdownItemsEnterSelection = dropdownItemsSelection
    .enter()
    .append("label")
    .attr("class", "select__dropdown-item");

  dropdownItemsEnterSelection
    .append("input")
    .attr("class", "select__checkbox")
    .attr("type", "checkbox");

  dropdownItemsEnterSelection
    .append("span")
    .attr("class", "source-select__file-name")
    .text(source => source);

  hiddenSourcesStore.subscribeUnique(
    root,
    hiddenSourcesSubscription,
    hiddenSources => {
      const showingAllSources = hiddenSources.length === 0;
      const showingSomeSources = sources.some(
        source => !hiddenSources.includes(source)
      );
      root
        .select(".select__button")
        .text(
          `Showing ${
            showingAllSources ? "All" : showingSomeSources ? "Some" : "No"
          } Sources`
        );

      dropdownItemsSelection
        .merge(dropdownItemsEnterSelection)
        .each(function(source, i) {
          if (i === 0) {
            // We are on the All checkbox
            d3.select(this)
              .select(".select__checkbox")
              .property("checked", showingAllSources)
              .property(
                "indeterminate",
                showingSomeSources && !showingAllSources
              )
              .on("change", function() {
                if (this.checked) {
                  hiddenSourcesStore.dispatch(() => []);
                } else {
                  hiddenSourcesStore.dispatch(() => sources);
                }
              });
          } else {
            d3.select(this)
              .select(".select__checkbox")
              .property("checked", !hiddenSources.includes(source))
              .on("change", function() {
                if (this.checked) {
                  hiddenSourcesStore.dispatch(hiddenSources =>
                    hiddenSources.filter(
                      hiddenSource => hiddenSource !== source
                    )
                  );
                } else {
                  hiddenSourcesStore.dispatch(hiddenSources => [
                    ...hiddenSources,
                    source
                  ]);
                }
              });
          }
        });
    }
  );
}

module.exports = { render, hiddenSourcesStore };
