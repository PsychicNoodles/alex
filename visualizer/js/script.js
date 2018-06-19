/* ******************************* Require ********************************** */
const d3 = require("d3");
const { ipcRenderer } = require("electron");
const fs = require("fs");

require("bootstrap");

const processData = require("./js/process-data");
const draw = require("./js/draw");

const yAxisLabel = "cache";
const xAxisLabel = "cyclesSoFar";

/* ******************************** Loading ********************************* */
/* This region should deal ONLY with the loading of the data. AFTER this, it
should send off the data to be processed. */
ipcRenderer.send("result-request");
ipcRenderer.on("result", (event, resultFile) => {
  let result;
  try {
    result = JSON.parse(fs.readFileSync(resultFile).toString());
  } catch (err) {
    alert(`Invalid result file: ${err.message}`);
    window.close();
  }

  const processedData = processData(result.timeslices, yAxisLabel, xAxisLabel);
  draw(processedData, xAxisLabel, yAxisLabel);

  document.querySelector("#buttons").addEventListener("change", event => {
    draw(processedData, event.target.value, yAxisLabel);
  });
});

/* *************************** UI to choose xAxis *************************** */
const button = function() {
  function my(selection) {
    selection.each(function(d) {
      const label = d3.select(this).text(d);

      label
        .append("input")
        .attr("type", "radio")
        .attr("name", "radio")
        .attr("value", d);

      label.append("span").attr("class", "checkmark");
    });
  }
  return my;
};

const data = ["CPUCyclesAcc", "instructionsAcc"];

const buttonFunc = button();

// Add buttons
d3
  .select("#buttons")
  .selectAll(".container")
  .data(data)
  .enter()
  .append("label")
  .attr("class", "container")
  .call(buttonFunc);
