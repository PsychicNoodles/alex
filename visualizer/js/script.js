const { ipcRenderer } = require("electron");
const fs = require("fs");
const readline = require("readline");
const d3 = require("d3");

const ProgressBar = require("progressbar.js");
const { PROGRESS_HEIGHT, PROGRESS_DIVISIONS } = require("./util");

require("bootstrap");

const { processData, computeRenderableData } = require("./process-data");
const chart = require("./chart");
const functionRuntimes = require("./function-runtimes");
const legend = require("./legend");
const { CHART_WIDTH, CHART_HEIGHT } = require("./util");

const spectrum = d3.interpolateGreens;

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
    // usually doesn't appear because JSON.parse takes up all the CPU
    bar.set(1.0);
    bar.setText("Parsing JSON...");

    result = JSON.parse(result);
    const processedData = processData(result.timeslices, result.header);

    bar.destroy();

    const xAxisLabel = "CPU Time Elapsed";
    const getIndependentVariable = d => d.cpuTime;

    const yAxisLabel = "Cache Miss Rate";
    const getDependentVariable = d => d.events.missRate;

    d3.select(".function-runtimes").call(functionRuntimes.render, {
      data: processedData
    });

    const xScaleMax = getIndependentVariable(
      processedData[processedData.length - 1]
    );
    const xScaleMin = getIndependentVariable(processedData[0]);
    const yScaleMax = d3.max(processedData, getDependentVariable);
    const xScale = d3
      .scaleLinear()
      .domain([xScaleMin, xScaleMax])
      .range([0, CHART_WIDTH]);
    const yScale = d3
      .scaleLinear()
      .domain([yScaleMax, 0])
      .range([0, CHART_HEIGHT]);

    const plotData = computeRenderableData({
      data: processedData,
      xScale,
      yScale,
      getIndependentVariable,
      getDependentVariable
    });

    const densityMax = d3.max(plotData, d => d.densityAvg);

    d3.select(".charts")
      .append("svg")
      .attr("class", "chart")
      .call(chart.render, {
        timeslices: processedData,
        getIndependentVariable,
        getDependentVariable,
        xAxisLabel,
        yAxisLabel,
        xScale,
        yScale,
        plotData,
        densityMax,
        spectrum
      });

    d3.select("#legend").call(legend.render, { densityMax, spectrum });
  });
});
