const d3 = require("d3");

const { Store } = require("./store");

// the author of this library seem to quite get how module.exports works
require("bootstrap-colorpicker");
// necessary evil of also requiring jquery to set handlers for its events
const $ = require("jquery");

const highlightedWarningsSubscription = d3.local();
const highlightedWarningsStore = new Store([]);

const dropdownIsOpen = d3.local();

const DEFAULT_WARNING_COLOR = "rgba(255, 0, 0, 0.8)";

function render(root, { warningCounts, warningRecords }) {
  //set up dom
  root.classed("warnings", true);

  if (root.property(dropdownIsOpen) === undefined) {
    root.property(dropdownIsOpen, false);
  }

  if (root.select(".warnings__button").empty()) {
    root.append("button").attr("class", "warnings__button");
  }

  if (root.select(".warnings__dropdown").empty()) {
    root.append("div").attr("class", "warnings__dropdown");
  }

  //class "open" if the warnings button is clicked
  root.classed("warnings--dropdown-open", root.property(dropdownIsOpen));

  root.select(".warnings__button").on("click", () => {
    root
      .property(dropdownIsOpen, !root.property(dropdownIsOpen))
      .classed("warnings--dropdown-open", root.property(dropdownIsOpen));
  });

  const dropdownItemsSelection = root
    .select(".warnings__dropdown")
    .selectAll(".warnings__dropdown-item")
    .data(["All Warning Types", ...warningCounts.map(pair => pair[0])]);

  const dropdownItemsEnterSelection = dropdownItemsSelection
    .enter()
    .append("div")
    .attr("class", "warnings__dropdown-item input-group colorpicker-component");

  dropdownItemsEnterSelection
    .append("input")
    .attr("class", "warnings__checkbox")
    .attr("type", "checkbox")
    .attr("id", (d, i) => `warning__checkbox-${i}`);

  dropdownItemsEnterSelection
    .append("label")
    .attr("class", "warnings__type")
    .attr("for", (d, i) => `warning__checkbox-${i}`)
    .text(warning => warning);

  // color picker input
  dropdownItemsEnterSelection
    .append("input")
    .attr("class", "warnings__color-picker")
    .attr("type", "hidden");

  // color picker image/popover
  dropdownItemsEnterSelection
    .append("span")
    .attr("class", "input-group-addon")
    .append("i");

  dropdownItemsEnterSelection.each((d, i, g) => {
    if (i > 0) {
      // skip the "All Warning Types" item
      $(g[i])
        .colorpicker({
          color: DEFAULT_WARNING_COLOR,
          input: ".warnings__color-picker"
        })
        .on("changeColor", e => {
          d3.selectAll(`.warning-lines__type-${i}`).style("stroke", e.color);
        });
    }
  });

  //set up store subscription to update the warning list so that other parts can be notified and update as well

  highlightedWarningsStore.subscribeUnique(
    root,
    highlightedWarningsSubscription,
    highlightedWarnings => {
      const hasWarnings = warningRecords.length > 0;
      const highlightedWarningsCounts = warningCounts.map(
        ([type]) =>
          highlightedWarnings.filter(highlighted => highlighted.type === type)
            .length
      );
      const highlightedAllWarnings = warningCounts.map(
        ([, totalCount], i) => highlightedWarningsCounts[i] === totalCount
      );
      const highlightedAllAllWarnings = highlightedAllWarnings.every(
        all => all
      );
      const highlightedSomeWarnings = warningCounts.map(
        (_, i) => highlightedWarningsCounts[i] > 0
      );
      const highlightedSomeAllWarnings = highlightedSomeWarnings.some(
        some => some
      );
      root
        .select(".warnings__button")
        .property("disabled", !hasWarnings)
        .text(
          hasWarnings
            ? `Highlighting ${
                highlightedAllAllWarnings
                  ? "All"
                  : highlightedSomeAllWarnings
                    ? "Some"
                    : "No"
              } Warning Types`
            : "No Warnings"
        );

      dropdownItemsSelection
        .merge(dropdownItemsEnterSelection)
        .each(function(warning, i) {
          if (i === 0) {
            // We are on the All checkbox
            d3.select(this)
              .select(".warnings__checkbox")
              .property("checked", highlightedAllAllWarnings)
              .property(
                "indeterminate",
                highlightedSomeAllWarnings && !highlightedAllAllWarnings
              )
              .on("change", function() {
                if (this.checked) {
                  highlightedWarningsStore.dispatch(() => warningRecords);
                } else {
                  highlightedWarningsStore.dispatch(() => []);
                }
              });
          } else {
            d3.select(this)
              .select(".warnings__checkbox")
              .property("checked", highlightedAllWarnings[i - 1])
              .property(
                "indeterminate",
                highlightedSomeWarnings[i - 1] && !highlightedAllWarnings[i - 1]
              )
              .on("change", function() {
                if (this.checked) {
                  highlightedWarningsStore.dispatch(highlightedWarnings => [
                    ...highlightedWarnings,
                    ...warningRecords.filter(
                      record =>
                        warning === record.type &&
                        !highlightedWarnings.includes(record)
                    )
                  ]);
                } else {
                  highlightedWarningsStore.dispatch(highlightedWarnings =>
                    highlightedWarnings.filter(
                      highlightedWarning => highlightedWarning.type !== warning
                    )
                  );
                }
              });
          }
        });
    }
  );
}

function renderLines(
  root,
  { xScale, warningRecords, warningsDistinct, cpuTimeOffset }
) {
  root.classed("warning-lines", true);

  const linesSelection = root
    .selectAll(".warning-lines__line")
    .data(warningRecords);

  const linesUpdateSelection = linesSelection
    .enter()
    .append("line")
    .attr(
      "class",
      d =>
        `warning-lines__line warning-lines__type-${warningsDistinct.indexOf(
          d.type
        ) + 1}`
    )
    .attr("y1", -20)
    .attr("y2", 0)
    .attr("position", "absolute")
    .style("stroke-width", 0.5)
    .style("stroke", DEFAULT_WARNING_COLOR)
    .merge(linesSelection)
    .attr("x1", d => xScale(d.time - cpuTimeOffset))
    .attr("x2", d => xScale(d.time - cpuTimeOffset));

  highlightedWarningsStore.subscribeUnique(
    root,
    highlightedWarningsSubscription,
    highlightedWarnings => {
      linesUpdateSelection.style(
        "stroke-opacity",
        d => (highlightedWarnings.includes(d) ? 1 : 0)
      );
    }
  );
}

module.exports = {
  render,
  highlightedWarningsStore,
  renderLines
};
