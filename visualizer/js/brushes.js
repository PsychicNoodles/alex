const d3 = require("d3");
const functionRuntimes = require("./function-runtimes");

let nextBrushId = 0;

function render(
  gBrushes,
  { timeslices, svg, brushes, xScale, getIndependentVariable }
) {
  const chart = require("./chart");

  gBrushes.classed("brushes", true);

  const brush = d3
    .brushX()
    .extent([[0, 0], [chart.WIDTH, chart.HEIGHT]])
    .on("brush", function() {
      return brushed({
        currentBrush: this,
        timeslices,
        xScale,
        svg,
        gBrushes,
        getIndependentVariable
      });
    })
    .on("end", () => {
      brushEnd(
        timeslices,
        brushes,
        gBrushes,
        svg,
        xScale,
        getIndependentVariable
      );
    });

  // Add brush to array of objects
  brushes.push({ id: nextBrushId, brush: brush });
  nextBrushId++;
  drawBrushes(
    brushes,
    gBrushes,
    timeslices,
    svg,
    xScale,
    getIndependentVariable
  );
}

function brushEnd(
  timeslices,
  brushes,
  gBrushes,
  svg,
  xScale,
  getIndependentVariable
) {
  d3.select("#function-runtimes").call(functionRuntimes.render, {
    data: timeslices
  });

  const lastBrushId = brushes[brushes.length - 1].id;
  const lastBrush = document.getElementById("brush-" + lastBrushId);
  const selection = d3.brushSelection(lastBrush);

  // If the latest brush has a selection, make a new one
  if (selection && selection[0] !== selection[1]) {
    gBrushes.call(render, {
      timeslices,
      svg,
      brushes,
      xScale,
      getIndependentVariable
    });
  }

  document.getElementById("btnClearBrushes").addEventListener("click", () => {
    clearBrushes({
      brushes,
      svg,
      timeslices,
      xScale,
      gBrushes,
      getIndependentVariable
    });
  });
}

function drawBrushes(
  brushes,
  gBrushes,
  timeslices,
  svg,
  xScale,
  getIndependentVariable
) {
  const brushSelection = gBrushes.selectAll("g.brush").data(brushes, d => d.id);

  const brushEnterSelection = brushSelection
    .enter()
    .insert("g", ".brush")
    .attr("class", "brush brush--invisible");

  brushEnterSelection
    .merge(brushSelection)
    .attr("id", brush => "brush-" + brush.id)
    .each(function(brushObject) {
      brushObject.brush(d3.select(this));
      d3.select(this)
        .selectAll(".overlay")
        .style("pointer-events", () => {
          const brush = brushObject.brush;
          if (
            brushObject.id === brushes[brushes.length - 1].id &&
            brush !== undefined
          ) {
            return "all";
          } else {
            return "none";
          }
        });
    });

  brushSelection.exit().remove();

  brushEnterSelection.each(function() {
    const gClearBrush = d3
      .select(this)
      .append("g")
      .attr("class", "brush__close")
      .attr("pointer-events", "all")
      .on("click", () => {
        const index = brushes.findIndex(d => "brush-" + d.id === this.id);
        brushes.splice(index, 1);
        d3.select(this).remove();
        selectPoints(timeslices, svg, gBrushes, xScale, getIndependentVariable);
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
function brushed({
  currentBrush,
  timeslices,
  xScale,
  svg,
  gBrushes,
  getIndependentVariable
}) {
  const selection = d3.event.selection;
  if (selection !== null) {
    selectPoints(timeslices, svg, gBrushes, xScale, getIndependentVariable);

    d3.select(currentBrush)
      .select(".brush__close")
      .attr(
        "transform",
        `translate(${d3.brushSelection(currentBrush)[1] - 24},0)`
      );

    d3.select(currentBrush).attr("class", "brush");
  }
}

function selectPoints(
  timeslices,
  svg,
  gBrushes,
  xScale,
  getIndependentVariable
) {
  const circles = svg.selectAll(".circles circle");

  circles.attr("class", "");

  for (const timeslice of timeslices) {
    timeslice.selected = false;
  }

  gBrushes.selectAll("g.brush").each(function() {
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

function clearBrushes({
  brushes,
  svg,
  timeslices,
  xScale,
  gBrushes,
  getIndependentVariable
}) {
  const circles = svg.selectAll("circle");

  for (const timeslice of timeslices) {
    timeslice.selected = false;
  }

  circles.attr("class", "circle");

  d3.select("#function-runtimes").call(functionRuntimes.render, {
    data: timeslices
  });

  brushes.splice(0);

  gBrushes.selectAll(".brush").remove();
  gBrushes.call(render, {
    timeslices,
    svg,
    brushes,
    gBrushes,
    xScale,
    getIndependentVariable
  });
}

module.exports = { render };
