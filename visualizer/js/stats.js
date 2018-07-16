const d3 = require("d3");

function render(root, { processedData }) {
  const numTimeslices = processedData.length,
    startTime = processedData[0].cpuTime,
    endTime = processedData[numTimeslices - 1].cpuTime;

  root.append("h3").text("Stats");

  const statsSelectionEnter = root
    .append("ul")
    .selectAll("p")
    .data([
      ["Timeslices", numTimeslices],
      ["CPU Time Elapsed", endTime - startTime, "time"],
      [
        "Average Timeslice Duration",
        (endTime - startTime) / numTimeslices,
        "time"
      ]
    ])
    .enter()
    .append("li");

  statsSelectionEnter
    .append("span")
    .attr("class", "title")
    .text(d => d[0] + ":")
    .append("br");

  statsSelectionEnter
    .filter(d => d[2] !== "time")
    .append("span")
    .attr("class", "value")
    .text(d => d[1]);

  const statsTime = statsSelectionEnter
    .filter(d => d[2] === "time")
    .append("abbr")
    .attr("class", "value");
  statsTime
    .append("span")
    .text(d => d[1] / 1000000000)
    .attr("title", d => `${d[1]} Nanoseconds`)
    .append("br");
  statsTime.append("span").text("Seconds");
}

module.exports = {
  render
};
