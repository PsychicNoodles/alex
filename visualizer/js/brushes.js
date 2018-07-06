const d3 = require("d3");
const functionRuntimes = require("./function-runtimes");
const { Store } = require("./store");

const nextBrushId = d3.local();
const brushesLocal = d3.local();

const brushId = d3.local();

const store = new Store({
  selections: [],
  nextSelectionId: 0
  // lastMovedBrush: null
});

function initLocals(root) {
  if (root.property(nextBrushId) === undefined) {
    root.property(nextBrushId, 0);
  }

  if (root.property(brushesLocal) === undefined) {
    root.property(brushesLocal, []);
  }
}

function addBrush(root, { timeslices, chart, xScale, getIndependentVariable }) {
  // Add brush to array of objects
  const id = root.property(nextBrushId);
  root.property(brushesLocal, [...root.property(brushesLocal), { id }]);
  root.property(nextBrushId, id + 1);

  root.call(render, {
    timeslices,
    chart,
    xScale,
    getIndependentVariable
  });
}

function render(root, { timeslices, chart, xScale, getIndependentVariable }) {
  // Require here to avoid circular dependency
  const { WIDTH, HEIGHT } = require("./chart");

  initLocals(root);
  root.classed("brushes", true);

  const brushSelection = root
    .selectAll("g.brush")
    .data([...root.property(brushesLocal), { id: root.property(nextBrushId) }]);

  const brushEnterSelection = brushSelection
    .enter()
    .insert("g", ".brush")
    .attr("class", "brush");

  brushEnterSelection
    .merge(brushSelection)
    .property(brushId, brush => brush.id)
    .classed("brush--invisible", ({ id }) => id === root.property(nextBrushId))
    .call(
      d3
        .brushX()
        .extent([[0, 0], [WIDTH, HEIGHT]])
        .on("brush", function() {
          onBrushMove({
            currentBrush: this,
            timeslices,
            xScale,
            chart,
            root,
            getIndependentVariable
          });
        })
        .on("end", function() {
          onBrushMoveEnd({
            currentBrush: this,
            timeslices,
            root,
            chart,
            xScale,
            getIndependentVariable
          });
        })
    );

  brushSelection.exit().remove();

  // Add close buttons
  brushEnterSelection.each(function() {
    const brush = this;
    const gClearBrush = d3
      .select(this)
      .append("g")
      .attr("class", "brush__close")
      .on("click", () => {
        const index = root
          .property(brushesLocal)
          .findIndex(d => d.id === brushId.get(brush));
        root.property(brushesLocal).splice(index, 1);
        d3.select(brush).remove();
        selectPoints({
          timeslices,
          chart,
          root,
          xScale,
          getIndependentVariable
        });
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
}

// Re-color the circles in the region that was selected by the user
function onBrushMove({
  currentBrush,
  timeslices,
  xScale,
  chart,
  root,
  getIndependentVariable
}) {
  const selection = d3.event.selection;
  if (selection !== null) {
    selectPoints({ timeslices, chart, root, xScale, getIndependentVariable });

    d3.select(currentBrush)
      .select(".brush__close")
      .attr(
        "transform",
        `translate(${d3.brushSelection(currentBrush)[1] - 24},0)`
      );

    d3.select(currentBrush).classed("brush--invisible", false);
  }
}

function onBrushMoveEnd({
  currentBrush,
  timeslices,
  root,
  chart,
  xScale,
  getIndependentVariable
}) {
  d3.select("#function-runtimes").call(functionRuntimes.render, {
    data: timeslices
  });

  // If we selected the invisible brush, add it to the official list
  if (brushId.get(currentBrush) === root.property(nextBrushId)) {
    root.call(addBrush, {
      timeslices,
      chart,
      xScale,
      getIndependentVariable
    });
  }
}

function selectPoints({
  timeslices,
  chart,
  root,
  xScale,
  getIndependentVariable
}) {
  const circles = chart.selectAll(".circles circle");

  circles.attr("class", "");

  for (const timeslice of timeslices) {
    timeslice.selected = false;
  }

  root.selectAll("g.brush").each(function() {
    const brushArea = d3.brushSelection(this);

    if (brushArea) {
      circles
        .filter(function() {
          const cx = d3.select(this).attr("cx");
          return brushArea[0] <= cx && cx <= brushArea[1];
        })
        .attr("class", "brushed");

      for (const timeslice of timeslices) {
        const x = xScale(getIndependentVariable(timeslice));
        if (brushArea[0] <= x && x <= brushArea[1]) {
          timeslice.selected = true;
        }
      }
    }
  });

  d3.select("#function-runtimes").call(functionRuntimes.render, {
    data: timeslices
  });
}

function clear(root, { chart, timeslices, xScale, getIndependentVariable }) {
  root.call(render, {
    timeslices,
    chart,
    xScale,
    getIndependentVariable
  });

  const circles = chart.selectAll("circle");

  for (const timeslice of timeslices) {
    timeslice.selected = false;
  }

  circles.attr("class", "circle");

  d3.select("#function-runtimes").call(functionRuntimes.render, {
    data: timeslices
  });

  root.property(brushesLocal, []);

  root.call(render, {
    timeslices,
    chart,
    xScale,
    getIndependentVariable
  });
}

module.exports = { render, clear };
