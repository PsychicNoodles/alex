const d3 = require("d3");

const { Store } = require("./store");

// the author of this library seem to quite get how module.exports works
require("bootstrap-colorpicker");
// necessary evil of also requiring jquery to set handlers for its events
const $ = require("jquery");

const highlightedErrorsSubscription = d3.local();
const highlightedErrorsStore = new Store([]);

const dropdownIsOpen = d3.local();

const DEFAULT_ERROR_COLOR = "rgba(255, 0, 0, 0.8)";

function render(root, { errorCounts, errorRecords }) {
  //set up dom
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

  //class "open" if the errors button is clicked
  root.classed("errors--dropdown-open", root.property(dropdownIsOpen));

  root.select(".errors__button").on("click", () => {
    root
      .property(dropdownIsOpen, !root.property(dropdownIsOpen))
      .classed("errors--dropdown-open", root.property(dropdownIsOpen));
  });

  const dropdownItemsSelection = root
    .select(".errors__dropdown")
    .selectAll(".errors__dropdown-item")
    .data(["All Error Types", ...errorCounts.map(pair => pair[0])]);

  const dropdownItemsEnterSelection = dropdownItemsSelection
    .enter()
    .append("div")
    .attr("class", "errors__dropdown-item input-group colorpicker-component");

  dropdownItemsEnterSelection
    .append("input")
    .attr("class", "errors__checkbox")
    .attr("type", "checkbox")
    .attr("id", (d, i) => `error__checkbox-${i}`);

  dropdownItemsEnterSelection
    .append("label")
    .attr("class", "errors__type")
    .attr("for", (d, i) => `error__checkbox-${i}`)
    .text(error => error);

  // color picker input
  dropdownItemsEnterSelection
    .append("input")
    .attr("class", "errors__color-picker")
    .attr("type", "hidden");

  // color picker image/popover
  dropdownItemsEnterSelection
    .append("span")
    .attr("class", "input-group-addon")
    .append("i");

  dropdownItemsEnterSelection.each((d, i, g) => {
    if (i > 0) {
      // skip the "All Error Types" item
      $(g[i])
        .colorpicker({
          color: DEFAULT_ERROR_COLOR,
          input: ".errors__color-picker"
        })
        .on("changeColor", e => {
          d3.selectAll(`.error-lines__type-${i}`).style("stroke", e.color);
        });
    }
  });

  //set up store subscription to update the error list so that other parts can be notified and update as well

  highlightedErrorsStore.subscribeUnique(
    root,
    highlightedErrorsSubscription,
    highlightedErrors => {
      const hasErrors = errorRecords.length > 0;
      const highlightedErrorsCounts = errorCounts.map(
        ([type]) =>
          highlightedErrors.filter(highlighted => highlighted.type === type)
            .length
      );
      const highlightedAllErrors = errorCounts.map(
        ([_, totalCount], i) => highlightedErrorsCounts[i] === totalCount
      );
      const highlightedAllAllErrors = highlightedAllErrors.every(all => all);
      const highlightedSomeErrors = errorCounts.map(
        ([_], i) => highlightedErrorsCounts[i] > 0
      );
      const highlightedSomeAllErrors = highlightedSomeErrors.some(some => some);
      root
        .select(".errors__button")
        .property("disabled", !hasErrors)
        .text(
          hasErrors
            ? `Highlighting ${
                highlightedAllAllErrors
                  ? "All"
                  : highlightedSomeAllErrors
                    ? "Some"
                    : "No"
              } Error Types`
            : "No Errors"
        );

      dropdownItemsSelection
        .merge(dropdownItemsEnterSelection)
        .each(function(error, i) {
          if (i === 0) {
            // We are on the All checkbox
            d3.select(this)
              .select(".errors__checkbox")
              .property("checked", highlightedAllAllErrors)
              .property(
                "indeterminate",
                highlightedSomeAllErrors && !highlightedAllAllErrors
              )
              .on("change", function() {
                if (this.checked) {
                  highlightedErrorsStore.dispatch(() => errorRecords);
                } else {
                  highlightedErrorsStore.dispatch(() => []);
                }
              });
          } else {
            d3.select(this)
              .select(".errors__checkbox")
              .property("checked", highlightedAllErrors[i - 1])
              .property(
                "indeterminate",
                highlightedSomeErrors[i - 1] && !highlightedAllErrors[i - 1]
              )
              .on("change", function() {
                if (this.checked) {
                  highlightedErrorsStore.dispatch(highlightedErrors => [
                    ...highlightedErrors,
                    ...errorRecords.filter(
                      record =>
                        error === record.type &&
                        !highlightedErrors.includes(record)
                    )
                  ]);
                } else {
                  highlightedErrorsStore.dispatch(highlightedErrors =>
                    highlightedErrors.filter(
                      highlightedError => highlightedError.type !== error
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
  { xScale, errorRecords, errorsDistinct, cpuTimeOffset }
) {
  root.classed("error-lines", true);

  const linesSelection = root
    .selectAll(".error-lines__line")
    .data(errorRecords);

  const linesUpdateSelection = linesSelection
    .enter()
    .append("line")
    .attr(
      "class",
      d =>
        `error-lines__line error-lines__type-${errorsDistinct.indexOf(d.type) +
          1}`
    )
    .attr("y1", -20)
    .attr("y2", 0)
    .attr("position", "absolute")
    .style("stroke-width", 0.5)
    .style("stroke", DEFAULT_ERROR_COLOR)
    .merge(linesSelection)
    .attr("x1", d => xScale(d.time - cpuTimeOffset))
    .attr("x2", d => xScale(d.time - cpuTimeOffset));

  highlightedErrorsStore.subscribeUnique(
    root,
    highlightedErrorsSubscription,
    highlightedErrors => {
      linesUpdateSelection.style(
        "stroke-opacity",
        d => (highlightedErrors.includes(d) ? 1 : 0)
      );
    }
  );
}

module.exports = {
  render,
  highlightedErrorsStore,
  renderLines
};
