const { ipcRenderer } = require("electron");
const fs = require("fs");
const readline = require("readline");
const d3 = require("d3");

const ProgressBar = require("progressbar.js");
const { PROGRESS_HEIGHT, PROGRESS_DIVISIONS } = require("./util");

require("bootstrap");

const { processData } = require("./process-data");
const { draw } = require("./draw");
const functionRuntimes = require("./function-runtimes");

ipcRenderer.send("result-request");
ipcRenderer.on("result", (event, resultFile) => {
  let result = "",
    bytesRead = 0,
    bytesTotal,
    rl,
    bar;
  try {
    bytesTotal = fs.statSync(resultFile)["size"];
    const progressPoints = [...Array(PROGRESS_DIVISIONS).keys()].map(
      n => bytesTotal * (n / PROGRESS_DIVISIONS)
    );
    bar = new ProgressBar.Line("#progress", {
      strokeWidth: 4,
      easing: "easeInOut",
      color: "#FFEA82",
      trailColor: "#eee",
      trailWidth: 1,
      svgStyle: { width: "100%", height: PROGRESS_HEIGHT },
      text: {
        style: {
          color: "#999",
          verticalAlign: "middle",
          textAlign: "center"
        },
        autoStyleContainer: false
      },
      step: (state, bar) =>
        bar.setText(
          `Read in ${Math.round(bar.value() * 100) + "%"} of result file`
        )
    });
    rl = readline
      .createInterface({
        input: fs.createReadStream(resultFile)
      })
      .on("line", line => {
        result += line.replace(/([^"]+)|("[^"]+")/g, ($0, $1, $2) => {
          if ($1) {
            return $1.replace(/\s/g, "");
          } else {
            return $2;
          }
        });
        bytesRead += line.length + 1;
        if (bytesRead >= progressPoints[0]) {
          bar.animate(bytesRead / bytesTotal);
          progressPoints.shift();
        }
      });
  } catch (err) {
    alert(`Invalid result file: ${err.message}`);
    window.close();
  }

  rl.on("close", () => {
    bar.destroy();

    result = JSON.parse(result);
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
});
