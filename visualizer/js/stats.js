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
      { name: "Timeslices", number: numTimeslices, isTime: false },
      { name: "Elapsed CPU Time", number: endTime - startTime, isTime: true },
      {
        name: "Average Timeslice Duration",
        number: (endTime - startTime) / numTimeslices,
        isTime: true
      }
    ])
    .enter()
    .append("li");

  statsSelectionEnter
    .append("span")
    .attr("class", "title")
    .text(({ name }) => name + ":")
    .append("br");

  statsSelectionEnter
    .filter(({ isTime }) => !isTime)
    .append("span")
    .attr("class", "value")
    .text(({ number }) => number);

  const statsTime = statsSelectionEnter
    .filter(({ isTime }) => isTime)
    .append("abbr")
    .attr("class", "value");

  statsTime
    .append("span")
    .text(({ number }) => d3.format(".4s")(number / 1000000000))
    .attr("title", ({ number }) => `${number} Nanoseconds`)
    .append("br");

  statsTime.append("span").text("Seconds");
}

module.exports = {
  render
};
