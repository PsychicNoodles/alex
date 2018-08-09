const d3 = require("d3");

const { Store } = require("./store");

const hiddenThreadsSubscription = d3.local();
const hiddenThreadsStore = new Store([]);

const dropdownIsOpen = d3.local();

function render(root, { threads }) {
  root.classed("thread-select dropdown", true);

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
    .data(["All Threads", ...threads]);

  const dropdownItemsEnterSelection = dropdownItemsSelection
    .enter()
    .append("label")
    .attr("class", "dropdown__item");

  dropdownItemsEnterSelection
    .append("input")
    .attr("class", "thread-select__checkbox")
    .attr("type", "checkbox");

  dropdownItemsEnterSelection
    .append("span")
    .attr("class", "thread-select__name")
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
        .select(".dropdown__button")
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
              .select(".thread-select__checkbox")
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
              .select(".thread-select__checkbox")
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
