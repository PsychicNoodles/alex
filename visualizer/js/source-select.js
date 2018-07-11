const d3 = require("d3");

const { Store } = require("./store");

const hiddenSourcesSubscription = d3.local();
const hiddenSourcesStore = new Store([]);

const dropdownIsOpen = d3.local();

function render(root, { sources }) {
  root.classed("source-select", true);

  if (root.property(dropdownIsOpen) === undefined) {
    root.property(dropdownIsOpen, false);
  }

  if (root.select(".source-select__button").empty()) {
    root.append("button").attr("class", "source-select__button");
  }

  if (root.select(".source-select__dropdown").empty()) {
    root.append("div").attr("class", "source-select__dropdown");
  }

  root.classed("source-select--dropdown-open", root.property(dropdownIsOpen));

  root.select(".source-select__button").on("click", () => {
    root
      .property(dropdownIsOpen, !root.property(dropdownIsOpen))
      .classed("source-select--dropdown-open", root.property(dropdownIsOpen));
  });

  const dropdownItemsSelection = root
    .select(".source-select__dropdown")
    .selectAll(".source-select__dropdown-item")
    .data(["All Sources", ...sources]);

  const dropdownItemsEnterSelection = dropdownItemsSelection
    .enter()
    .append("label")
    .attr("class", "source-select__dropdown-item");

  dropdownItemsEnterSelection
    .append("input")
    .attr("class", "source-select__checkbox")
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
        .select(".source-select__button")
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
              .select(".source-select__checkbox")
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
              .select(".source-select__checkbox")
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
