const d3 = require("d3");

const { Store } = require("./store");

const hiddenSourcesSubscription = d3.local();
const hiddenSourcesStore = new Store([]);

function render(root, { sources }) {
  root.classed("source-select", true);

  if (root.select(".source-select__button").empty()) {
    root.append("button").attr("class", "source-select__button");
  }

  if (root.select(".source-select__dropdown").empty()) {
    root.append("div").attr("class", "source-select__dropdown");
  }

  root.select(".source-select__button").text("Showing All Sources");

  const dropdownItemsSelection = root
    .select(".source-select__dropdown")
    .selectAll(".source-select__dropdown-item")
    .data(sources);

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
    .attr("class", "source-select__file-name");

  hiddenSourcesStore.subscribeUnique(
    root,
    hiddenSourcesSubscription,
    hiddenSources => {
      dropdownItemsSelection
        .merge(dropdownItemsEnterSelection)
        .each(function(source) {
          d3.select(this)
            .select(".source-select__checkbox")
            .property("checked", !hiddenSources.includes(source))
            .on("change", function() {
              if (this.checked) {
                hiddenSourcesStore.dispatch(hiddenSources =>
                  hiddenSources.filter(hiddenSource => hiddenSource !== source)
                );
              } else {
                hiddenSourcesStore.dispatch(hiddenSources => [
                  ...hiddenSources,
                  source
                ]);
              }
            });

          d3.select(this)
            .select(".source-select__file-name")
            .text(source);
        });
    }
  );
}

module.exports = { render, hiddenSourcesStore };
