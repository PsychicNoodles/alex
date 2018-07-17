const d3 = require("d3");

const hiddenThreadsSubscription = d3.local();

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

function render(root, { processedData, hiddenThreadsStore }) {
  root.append("h3").text("Stats");

  const statsSelection = root.append("ul").selectAll("li");

  hiddenThreadsStore.subscribeUnique(
    root,
    hiddenThreadsSubscription,
    hiddenThreads => {
      root.selectAll("li").remove();

      const statsSelectionEnter = statsSelection
        .data(
          calculateData(
            processedData.filter(
              timeslice => !hiddenThreads.includes(timeslice.tid)
            )
          )
        )
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
  );
}

module.exports = {
  render
};
