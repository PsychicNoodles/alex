const { ipcRenderer } = require("electron");
const fs = require("fs");

require("bootstrap");

const processData = require("./js/process-data");
const draw = require("./js/draw");
const {onXAxisSelect, renderXAxisSelect} = require("./js/x-axis-select")

ipcRenderer.send("result-request");
ipcRenderer.on("result", (event, resultFile) => {
  let result;
  try {
    result = JSON.parse(fs.readFileSync(resultFile).toString());
  } catch (err) {
    alert(`Invalid result file: ${err.message}`);
    window.close();
  }

  renderXAxisSelect()

  onXAxisSelect(xAxisOption => {
    const getIndependentVariable = d => d[xAxisOption.independentVariable];

    const yAxisLabel = "Cache Miss Rate";
    const getDependentVariable = d => d.events.missRate;

    const processedData = processData(
      result.timeslices,
      getIndependentVariable,
      getDependentVariable
    );
    draw(
      processedData,
      getIndependentVariable,
      getDependentVariable,
      xAxisOption.label,
      yAxisLabel
    );
  });
});
