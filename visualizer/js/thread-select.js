const d3 = require("d3");

const { Store } = require("./store");

const hiddenThreadsSubscription = d3.local();
const hiddenThreadsStore = new Store([]);

const dropdownIsOpen = d3.local();

function render(root, { threads }) {
  root.classed("thread-select select", true);

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
    .data(["All Threads", ...threads]);

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

  hiddenThreadsStore.subscribeUnique(
    root,
    hiddenThreadsSubscription,
    hiddenThreads => {
      const showingAllThreads = hiddenThreads.length === 0;
      const showingSomeThreads = threads.some(
        thread => !hiddenThreads.includes(thread)
      );
      root
        .select(".select__button")
        .text(
          `Showing ${
            showingAllThreads ? "All" : showingSomeThreads ? "Some" : "No"
          } Threads`
        );

      dropdownItemsSelection
        .merge(dropdownItemsEnterSelection)
        .each(function(thread, i) {
          if (i === 0) {
            // We are on the All checkbox
            d3.select(this)
              .select(".select__checkbox")
              .property("checked", showingAllThreads)
              .property(
                "indeterminate",
                showingSomeThreads && !showingAllThreads
              )
              .on("change", function() {
                if (this.checked) {
                  hiddenThreadsStore.dispatch(() => []);
                } else {
                  hiddenThreadsStore.dispatch(() => threads);
                }
              });
          } else {
            d3.select(this)
              .select(".select__checkbox")
              .property("checked", !hiddenThreads.includes(thread))
              .on("change", function() {
                if (this.checked) {
                  hiddenThreadsStore.dispatch(hiddenSources =>
                    hiddenSources.filter(
                      hiddenSource => hiddenSource !== thread
                    )
                  );
                } else {
                  hiddenThreadsStore.dispatch(hiddenSources => [
                    ...hiddenSources,
                    thread
                  ]);
                }
              });
          }
        });
    }
  );
}

module.exports = { render, hiddenThreadsStore };
