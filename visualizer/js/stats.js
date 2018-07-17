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

  const statsSelection = root.append("ul");

  const statsSelectionData = statsSelection
    .selectAll("li")
    .data(calculateData(processedData));

  const statsSelectionEnter = statsSelectionData.enter().append("li");

  statsSelectionEnter.append("span").attr("class", "title");

  statsSelectionEnter
    .filter(({ isTime }) => !isTime)
    .append("span")
    .attr("class", "value");

  const statsTime = statsSelectionEnter
    .filter(({ isTime }) => isTime)
    .append("abbr")
    .attr("class", "value");

  statsTime.append("span");

  statsTime.append("span").text("Seconds");

  hiddenThreadsStore.subscribeUnique(
    root,
    hiddenThreadsSubscription,
    hiddenThreads => {
      const statsSelectionData = statsSelection
        .selectAll("li")
        .data(
          calculateData(
            processedData.filter(
              timeslice => !hiddenThreads.includes(timeslice.tid)
            )
          )
        );

      const statsSelectionMerge = statsSelectionData
        .enter()
        .merge(statsSelectionData);

      statsSelectionMerge
        .select(".title")
        .text(({ name }) => name + ":")
        .append("br");

      statsSelectionMerge.select("span.value").text(({ number }) => number);

      statsSelectionMerge
        .select("abbr.value span")
        .text(({ number }) => d3.format(".4s")(number / 1000000000))
        .attr("title", ({ number }) => `${number} Nanoseconds`)
        .append("br");
    }
  );
}

module.exports = {
  render
};
