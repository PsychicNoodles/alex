const d3 = require("d3");

const plot = require("./plot");
const brushes = require("./brushes");
const functionRuntimes = require("./function-runtimes");

const WIDTH = 500;
const HEIGHT = 250;

function render(
  root,
  {
    timeslices,
    spectrum,
    plotData,
    densityMax,
    getIndependentVariable,
    getDependentVariable,
    xAxisLabel,
    yAxisLabel,
    xScale,
    yScale
  }
) {
  root.classed("chart", true).attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);

  root.selectAll("*").remove();

  root.append("g").call(plot.render, {
    data: plotData,
    xScale,
    yScale,
    getIndependentVariable,
    getDependentVariable,
    densityMax,
    spectrum
  });

  const brushesGroup = root.append("g");

  const brushesSubscription = brushes.store.subscribe(
    ({ selections, nextSelectionId }) => {
      brushesGroup.call(brushes.render, {
        timeslices,
        chart: root,
        xScale,
        getIndependentVariable,
        selections,
        nextSelectionId
      });
    }
  );

  document.getElementById("btnClearBrushes").addEventListener("click", () => {
    const circles = root.selectAll("circle");

    for (const timeslice of timeslices) {
      timeslice.selected = false;
    }

    circles.attr("class", "circle");

    d3.select("#function-runtimes").call(functionRuntimes.render, {
      data: timeslices
    });
  });

  root
    .append("g")
    .attr("class", "chart__axis chart__axis--x")
    .attr("transform", `translate(0, ${HEIGHT})`)
    .call(d3.axisBottom(xScale).tickFormat(d3.format(".2s")))

    // Label
    .append("text")
    .attr("class", "chart__axis-label chart__axis-label--x")
    .attr("text-anchor", "middle")
    .attr("x", WIDTH / 2)
    .attr("y", 50)
    .text(xAxisLabel);

  root
    .append("g")
    .attr("class", "chart__axis chart__axis--y")
    .call(d3.axisLeft(yScale).tickFormat(d3.format(".0%")))

    // Label
    .append("text")
    .attr("class", "chart__axis-label chart__axis-label--y")
    .attr("text-anchor", "middle")
    .attr("y", -40)
    .attr("x", -(HEIGHT / 2))
    .attr("transform", "rotate(-90)")
    .text(yAxisLabel);
}

module.exports = { render, WIDTH, HEIGHT };
