const { ipcRenderer } = require("electron");
const fs = require("fs");
const readline = require("readline");
const d3 = require("d3");

const ProgressBar = require("progressbar.js");

require("bootstrap");

const {
  processData,
  computeRenderableData,
  getEventCount
} = require("./process-data");
const chart = require("./chart");
const functionRuntimes = require("./function-runtimes");
const legend = require("./legend");

const PROGRESS_HEIGHT = "8px";
const PROGRESS_DIVISIONS = 10;

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

    const { presets } = result.header;
    const charts = [
      {
        presetsRequired: ["cache"],
        yAxisLabel: "Cache Miss Rate",
        yFormat: d3.format(".0%"),
        getDependentVariable: d =>
          getEventCount(d, presets.cache.misses) /
            (getEventCount(d, presets.cache.hits) +
              getEventCount(d, presets.cache.misses)) || 0
      },
      {
        presetsRequired: ["cpu"],
        yAxisLabel: "Instructions Per Cycle",
        yFormat: d3.format(".2"),
        getDependentVariable: d =>
          getEventCount(d, presets.cpu.instructions) /
            getEventCount(d, presets.cpu.CPUcycles) || 0
      }
    ].filter(({ presetsRequired }) =>
      presetsRequired.every(presetName => presetName in presets)
    );

    const xAxisLabel = "CPU Time Elapsed";
    const getIndependentVariable = d => d.cpuTime - processedData[0].cpuTime;

    d3.select("#function-runtimes").call(functionRuntimes.render, {
      data: processedData
    });

    const xScaleMin = getIndependentVariable(processedData[0]);
    const xScaleMax = getIndependentVariable(
      processedData[processedData.length - 1]
    );
    const xScale = d3
      .scaleLinear()
      .domain([xScaleMin, xScaleMax])
      .range([0, chart.WIDTH]);

    const yScalesByChart = new WeakMap();
    const plotDataByChart = new WeakMap();

    for (const chartParams of charts) {
      const { getDependentVariable } = chartParams;
      const yScaleMax = d3.max(processedData, getDependentVariable);
      const yScale = d3
        .scaleLinear()
        .domain([yScaleMax, 0])
        .range([0, chart.HEIGHT]);

      const plotData = computeRenderableData({
        data: processedData,
        xScale,
        yScale,
        getIndependentVariable,
        getDependentVariable
      });

      yScalesByChart.set(chartParams, yScale);
      plotDataByChart.set(chartParams, plotData);
    }

    const densityMax = charts.reduce(
      (currentMax, chart) =>
        Math.max(
          currentMax,
          d3.max(plotDataByChart.get(chart), d => d.densityAvg)
        ),
      0
    );
    const spectrum = d3.interpolateGreens;

    for (const chartParams of charts) {
      const { getDependentVariable, yAxisLabel, yFormat } = chartParams;
      d3.select("#charts")
        .append("svg")
        .call(chart.render, {
          timeslices: processedData,
          getIndependentVariable,
          getDependentVariable,
          xAxisLabel,
          yAxisLabel,
          xScale,
          yScale: yScalesByChart.get(chartParams),
          yFormat,
          plotData: plotDataByChart.get(chartParams),
          densityMax,
          spectrum
        });
    }

    d3.select("#legend").call(legend.render, { densityMax, spectrum });
  });
});
