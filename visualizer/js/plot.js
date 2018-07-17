const d3 = require("d3");

const hiddenThreadsSubscription = d3.local();

/**
 * Render the the scatter plot within the chart.
 */
function render(root, { data, hiddenThreadsStore, densityMax, spectrum }) {
  root.classed("plot", true);

  // Create the points and position them in the plot
  const circles = root
    .append("g")
    .attr("class", "circles")
    .selectAll("circle")
    .data(data);

  const circlesEnter = circles
    .enter()
    .append("circle")
    .merge(circles)
    .attr("class", "circle")
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", 1)
    .style("fill", d =>
      d3.scaleSequential(spectrum)(d.densityAvg / densityMax)
    );

  hiddenThreadsStore.subscribeUnique(
    root,
    hiddenThreadsSubscription,
    hiddenThreads => {
      circles.merge(circlesEnter).each(function(circle) {
        d3.select(this).style(
          "opacity",
          hiddenThreads.includes(circle.tid) ? 0 : 1.0
        );
      });
    }
  );
}

module.exports = { render };
