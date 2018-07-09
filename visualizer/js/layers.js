const d3 = require("d3");

const errorsSpectrum = d3.interpolateRainbow;

function setupLayers(result) {
  d3.select("#collapseErrors .list-group").call(
    setupErrors,
    d3.select("#plot"),
    result.error
  );
}

function toggleErrors(errType, isActive) {}

function setupErrors(toggles, plot, errors) {
  const errorTypes = errors.reduce((acc, val) => {
    if (acc.includes(val.type)) {
      return acc;
    }
    acc.push(val.type);
    return acc;
  }, []);
  toggles
    .selectAll("a")
    .data(errorTypes)
    .enter()
    .append("a")
    .attr("class", "list-group-item list-group-item-action")
    .text(d => d)
    .on("click", e => toggleErrors(e.text(), e.classed("active")));

  // add all the errors to the plot
  plot
    .append("g")
    .attr("class", "errors")
    .selectAll(".error")
    .data(errors)
    .enter();
}

module.exports = { setupLayers };
