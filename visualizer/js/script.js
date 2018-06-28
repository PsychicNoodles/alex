const { ipcRenderer } = require("electron");
const fs = require("fs");
const d3 = require("d3");

require("bootstrap");

const { processData } = require("./process-data");
const { draw } = require("./draw");
const functionRuntimes = require("./function-runtimes");

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

  d3.select(".function-runtimes").call(functionRuntimes.render, {
    data: processedData
  });

  draw(
    processedData,
    getIndependentVariable,
    getDependentVariable,
    xAxisLabel,
    yAxisLabel
  );
});
