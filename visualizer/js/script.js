const { ipcRenderer } = require("electron");
const fs = require("fs");

require("bootstrap");

const { processData } = require("./process-data");
const { draw } = require("./draw");

ipcRenderer.send("result-request");
ipcRenderer.on("result", (event, resultFile) => {
  let result;
  try {
    result = JSON.parse(fs.readFileSync(resultFile).toString());
  } catch (err) {
    alert(`Invalid result file: ${err.message}`);
    window.close();
  }

  const processedData = processData(result.timeslices, result.header);

  const xAxisLabel = "CPU Time Elapsed";
  const getIndependentVariable = d => d.cpuTime;

  const yAxisLabel = "Cache Miss Rate";
  const getDependentVariable = d => d.events.missRate;

  draw(
    processedData,
    getIndependentVariable,
    getDependentVariable,
    xAxisLabel,
    yAxisLabel
  );
});
