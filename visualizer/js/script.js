const d3 = require("d3");
const { ipcRenderer } = require("electron");
const fs = require("fs");

require("bootstrap");

const { processData } = require("./process-data");
const { draw } = require("./draw");
const { renderXAxisSelect } = require("./x-axis-select");

const xAxisOptions = [
  {
    independentVariable: "cyclesSoFar",
    label: "CPU Cycles"
  },
  {
    independentVariable: "instructionsSoFar",
    label: "Instructions Executed"
  }
];

ipcRenderer.send("result-request");
ipcRenderer.on("result", (event, resultFile) => {
  let result;
  try {
    result = JSON.parse(fs.readFileSync(resultFile).toString());
  } catch (err) {
    alert(`Invalid result file: ${err.message}`);
    window.close();
  }

  const processedData = processData(result.timeslices);

  d3.select(".x-axis-select").call(renderXAxisSelect, {
    options: xAxisOptions,
    onOptionSelect: xAxisOption => {
      const getIndependentVariable = d => d[xAxisOption.independentVariable];

      const yAxisLabel = "Cache Miss Rate";
      const getDependentVariable = d => d.events.missRate;

      draw(
        processedData,
        getIndependentVariable,
        getDependentVariable,
        xAxisOption.label,
        yAxisLabel
      );
    }
  });
});
