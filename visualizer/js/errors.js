const d3 = require("d3");

const { Store } = require("./store");

// the author of this library seem to quite get how module.exports works
require("bootstrap-colorpicker");
// necessary evil of also requiring jquery to set handlers for its events
const $ = require("jquery");

const highlightedErrorsSubscription = d3.local();
const highlightedErrorsStore = new Store([]);

const dropdownIsOpen = d3.local();

const DEFAULT_ERROR_COLOR = "rgba(255, 0, 0, 0.2)";

function render(root, { errors }) {
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
    .data(["All Error Types", ...errors]);

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
      const hasErrors = errors.length > 0;
      const highlightingAllErrors = errors.every(error =>
        highlightedErrors.includes(error)
      );
      const highlightingSomeErrors = highlightedErrors.length > 0;

      root
        .select(".errors__button")
        .property("disabled", !hasErrors)
        .text(
          hasErrors
            ? `Highlighting ${
                highlightingAllErrors
                  ? "All"
                  : highlightingSomeErrors
                    ? "Some"
                    : "No"
              } Errors`
            : "No Errors"
        );

      dropdownItemsSelection
        .merge(dropdownItemsEnterSelection)
        .each(function(error, i) {
          if (i === 0) {
            // We are on the All checkbox
            d3.select(this)
              .select(".errors__checkbox")
              .property("checked", highlightingAllErrors)
              .property(
                "indeterminate",
                highlightingSomeErrors && !highlightingAllErrors
              )
              .on("change", function() {
                if (this.checked) {
                  highlightedErrorsStore.dispatch(() => errors);
                } else {
                  highlightedErrorsStore.dispatch(() => []);
                }
              });
          } else {
            d3.select(this)
              .select(".errors__checkbox")
              .property("checked", highlightedErrors.includes(error))
              .on("change", function() {
                if (this.checked) {
                  highlightedErrorsStore.dispatch(highlightedErrors => [
                    ...highlightedErrors,
                    error
                  ]);
                } else {
                  highlightedErrorsStore.dispatch(highlightedErrors =>
                    highlightedErrors.filter(
                      highlightedSource => highlightedSource !== error
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
    .attr("y1", 0)
    .attr("y2", 250)
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
        d => (highlightedErrors.includes(d.type) ? 1 : 0)
      );
    }
  );
}

module.exports = {
  render,
  highlightedErrorsStore,
  renderLines
};
