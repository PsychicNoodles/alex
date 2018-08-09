const d3 = require("d3");

const { Store } = require("./store");

const hiddenSourcesSubscription = d3.local();
const hiddenSourcesStore = new Store([]);

const dropdownIsOpen = d3.local();

function render(root, { sources }) {
  root.classed("source-select dropdown", true);

  if (root.property(dropdownIsOpen) === undefined) {
    root.property(dropdownIsOpen, false);
  }

  if (root.select(".dropdown__button").empty()) {
    root.append("button").attr("class", "dropdown__button");
  }

  if (root.select(".dropdown__content").empty()) {
    root.append("div").attr("class", "dropdown__content");
  }

  root.classed("dropdown--open", root.property(dropdownIsOpen));

  root.select(".dropdown__button").on("click", () => {
    root
      .property(dropdownIsOpen, !root.property(dropdownIsOpen))
      .classed("dropdown--open", root.property(dropdownIsOpen));
  });

  const dropdownItemsSelection = root
    .select(".dropdown__content")
    .selectAll(".dropdown__item")
    .data(["All Sources", ...sources]);

  const dropdownItemsEnterSelection = dropdownItemsSelection
    .enter()
    .append("label")
    .attr("class", "dropdown__item");

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
        .select(".dropdown__button")
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
