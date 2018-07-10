const d3 = require("d3");

const { Store } = require("./store");

const brushId = d3.local();

const selectionSubscription = d3.local();
const selectionStore = new Store({
  selections: [],
  nextSelectionId: 0
});

const hoveredSelectionSubscription = d3.local();
const hoveredSelectionStore = new Store(null);

document
  .getElementById("clear-brushes-button")
  .addEventListener("click", () => {
    selectionStore.dispatch(state => ({
      ...state,
      selections: []
    }));
  });

function render(root) {
  // Require here to avoid circular dependency
  const { WIDTH, HEIGHT } = require("./chart");

  root.classed("brushes", true);

  const brush = d3
    .brushX()
    .extent([[0, 0], [WIDTH, HEIGHT]])
    .on("brush", function() {
      updateSelections(this);
    })
    .on("end", function() {
      updateSelections(this);
    });

  selectionStore.subscribeUnique(
    root,
    selectionSubscription,
    ({ selections, nextSelectionId }) => {
      const brushSelection = root.selectAll("g.brush").data(
        // Insert an invisible brush before all others (so it is at the bottom of
        // the stack and doesn't steal mouse clicks from existing brushes)
        [{ id: nextSelectionId, range: [0, 0] }, ...selections],
        // We need to use a key because we want to create a new element for each
        // new invisible selection
        selection => selection.id
      );

      const brushEnterSelection = brushSelection
        .enter()
        .append("g")
        .attr("class", "brush");

      const brushMergeSelection = brushEnterSelection.merge(brushSelection);

      brushMergeSelection
        .property(brushId, brush => brush.id)
        .classed("brush--invisible", ({ id }) => id === nextSelectionId)
        .call(brush)
        .each(function({ id, range }) {
          const actualRange = d3.brushSelection(this);
          if (
            !actualRange ||
            actualRange[0] !== range[0] ||
            actualRange[1] !== range[1]
          ) {
            d3.select(this).call(brush.move, range);
          }

          d3.select(this)
            .selectAll(".selection, .brush__close")
            .on("mouseover", () => {
              hoveredSelectionStore.dispatch(() => id);
            })
            .on("mouseleave", () => {
              hoveredSelectionStore.dispatch(() => null);
            });
        });

      brushSelection.exit().remove();

      // Add close buttons
      brushEnterSelection.each(function() {
        const brushElement = this;
        const gClearBrush = d3
          .select(this)
          .append("g")
          .attr("class", "brush__close")
          .on("click", () => {
            selectionStore.dispatch(state => ({
              ...state,
              selections: state.selections.filter(
                ({ id }) => id !== brushId.get(brushElement)
              )
            }));
          });

        gClearBrush
          .append("rect")
          .attr("width", 24)
          .attr("height", 24)
          .attr("opacity", 0.0);

        gClearBrush
          .append("path")
          .attr(
            "d",
            "M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 " +
              "16.41,20 12,20M12,2C6.47,2 2,6.47 2,12C2,17.53 6.47,22 12,22C17.53,22 22,17.53 " +
              "22,12C22,6.47 17.53,2 12,2M14.59,8L12,10.59L9.41,8L8,9.41L10.59,12L8,14.59L9.41," +
              "16L12,13.41L14.59,16L16,14.59L13.41,12L16,9.41L14.59,8Z"
          )
          .attr("class", "brush__close");
      });

      brushMergeSelection.each(function({ range }) {
        d3.select(this)
          .select(".brush__close")
          .attr("transform", `translate(${range[1] - 24}, 0)`);
      });
    }
  );

  hoveredSelectionStore.subscribeUnique(
    root,
    hoveredSelectionSubscription,
    hoveredSelection => {
      root
        .selectAll(".brush")
        .classed(
          "brush--selection-hovered",
          ({ id }) => id === hoveredSelection
        );
    }
  );
}

function updateSelections(currentBrush) {
  const id = brushId.get(currentBrush);
  const range = d3.brushSelection(currentBrush);

  if (range) {
    if (id === selectionStore.getState().nextSelectionId) {
      // If we selected the invisible brush, add it to the official list
      selectionStore.dispatch(state => ({
        ...state,
        selections: [{ id, range }, ...state.selections],
        nextSelectionId: state.nextSelectionId + 1
      }));
    } else {
      // Otherwise, update the range of the existing selection
      selectionStore.dispatch(state => ({
        ...state,
        selections: state.selections.map(
          selection =>
            selection.id === id ? { ...selection, range } : selection
        )
      }));
    }
  }
}

module.exports = { render, selectionStore };
