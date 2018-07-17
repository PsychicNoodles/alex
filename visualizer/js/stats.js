const d3 = require("d3");

function calculateData(processedData) {
  const numTimeslices = processedData.length,
    startTime = numTimeslices > 0 ? processedData[0].cpuTime : 0,
    endTime = numTimeslices > 0 ? processedData[numTimeslices - 1].cpuTime : 0;

  return [
    { name: "Timeslices", number: numTimeslices, isTime: false },
    { name: "CPU Time Elapsed", number: endTime - startTime, isTime: true },
    {
      name: "Average Timeslice Duration",
      number: (endTime - startTime) / numTimeslices || 0,
      isTime: true
    }
  ];
}

function render(root, { processedData }) {
  if (root.select("h3").empty()) {
    root.append("h3").text("Stats");
  }

  const statsSelection = root.select("ul").empty()
    ? root.append("ul")
    : root.select("ul");

  const statsDataSelection = statsSelection
    .selectAll("li")
    .data(calculateData(processedData));

  const statsEnterSelection = statsDataSelection.enter().append("li");

  statsEnterSelection.append("span").attr("class", "title");

  statsEnterSelection
    .filter(({ isTime }) => !isTime)
    .append("span")
    .attr("class", "value");

  const statsTime = statsEnterSelection
    .filter(({ isTime }) => isTime)
    .append("abbr")
    .attr("class", "value");

  statsTime.append("span");

  statsTime.append("span").text("Seconds");

  const statsMergeSelection = statsEnterSelection.merge(statsDataSelection);

  statsMergeSelection
    .select(".title")
    .text(({ name }) => name + ":")
    .append("br");

  statsMergeSelection.select("span.value").text(({ number }) => number);

  statsMergeSelection
    .select("abbr.value span")
    .text(({ number }) => d3.format(".4s")(number / 1000000000))
    .attr("title", ({ number }) => `${number} Nanoseconds`)
    .append("br");

  statsDataSelection.exit().remove();
}

module.exports = {
  render
};
