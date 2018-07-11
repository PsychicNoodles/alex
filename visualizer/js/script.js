const { ipcRenderer } = require("electron");
const d3 = require("d3");
const fs = require("fs");
const progressStream = require("progress-stream");
const { Line: LineProgressBar } = require("progressbar.js");
const streamJSON = require("stream-json");
const JSONAssembler = require("stream-json/Assembler");

const {
  processData,
  computeRenderableData,
  getEventCount
} = require("./process-data");
const { analyze } = require("./analysis");
const chart = require("./chart");
const functionRuntimes = require("./function-runtimes");
const legend = require("./legend");
const brushes = require("./brushes");
const sourceSelect = require("./source-select");
const stream = require("./stream");

ipcRenderer.send("result-request");
ipcRenderer.on("result", async (event, resultFile) => {
  try {
    const bytesTotal = await new Promise(resolve => {
      fs.stat(resultFile, (err, { size }) => {
        if (err) {
          alert(`Couldn't find result file: ${err.message}`);
          window.close();
        }

        resolve(size);
      });
    });

    const progressBar = new LineProgressBar("#progress", {
      strokeWidth: 4,
      easing: "easeInOut",
      color: "#4daf62",
      trailColor: "#eee",
      trailWidth: 1,
      svgStyle: { width: "100%", height: "15px" },
      text: {
        style: {
          color: "#999",
          verticalAlign: "middle",
          textAlign: "center"
        },
        autoStyleContainer: false
      },
      step: (state, bar) =>
        bar.setText(`Reading Result File (${Math.round(bar.value() * 100)}%)`)
    });
    d3.select("#progress").classed("progress--visible", true);

    const jsonTokenStream = fs
      .createReadStream(resultFile)
      .pipe(
        progressStream({ length: bytesTotal, time: 100 }, progress => {
          console.log(progress.percentage);
          progressBar.animate(progress.percentage / 100);
        })
      )
      .pipe(streamJSON.parser());

    jsonTokenStream.on("error", err => {
      alert(`Invalid result file: ${err}`);
      window.close();
    });

    const { current: result } = await new Promise((resolve, reject) =>
      JSONAssembler.connectTo(jsonTokenStream)
        .on("done", resolve)
        .on("error", reject)
    );

    progressBar.destroy();
    d3.select("#progress").classed("progress--visible", false);

    const processedData = processData(result.timeslices, result.header);

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
            getEventCount(d, presets.cpu.cpuCycles) || 0
      }
    ].filter(({ presetsRequired }) =>
      presetsRequired.every(presetName => presetName in presets)
    );

    const xAxisLabel = "CPU Time Elapsed";
    const getIndependentVariable = d => d.cpuTime - processedData[0].cpuTime;

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
      (currentMax, chartParams) =>
        Math.max(
          currentMax,
          d3.max(plotDataByChart.get(chartParams), d => d.densityAvg)
        ),
      0
    );

    const spectrum = d3.interpolateGreens;

    for (const chartParams of charts) {
      const { getDependentVariable, yAxisLabel, yFormat } = chartParams;
      d3.select("#charts")
        .append("div")
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
          spectrum:
            d3.max(plotDataByChart.get(chartParams), d => d.densityAvg) <= 2
              ? d3.interpolateRgb("#3A72F2", "#3A72F2")
              : spectrum
        });
    }

    d3.select("#legend").call(legend.render, { densityMax, spectrum });

    const sourcesSet = new Set();
    processedData.forEach(timeslice => {
      timeslice.stackFrames.forEach(frame => {
        sourcesSet.add(frame.fileName);
      });
    });

    d3.select("#source-select").call(sourceSelect.render, {
      sources: [...sourcesSet]
    });

    stream
      .fromStreamables([
        sourceSelect.hiddenSourcesStore.stream,
        brushes.selectionStore.stream
      ])
      .pipe(
        stream.map(([hiddenSources, { selections }]) =>
          analyze(
            processedData
              .map(timeslice => {
                const x = xScale(getIndependentVariable(timeslice));
                return {
                  ...timeslice,
                  selected:
                    selections.length === 0 ||
                    selections.some(
                      ({ range }) => range[0] <= x && x <= range[1]
                    ),
                  stackFrames: timeslice.stackFrames.filter(
                    frame => !hiddenSources.includes(frame.fileName)
                  )
                };
              })
              .filter(timeslice => timeslice.stackFrames.length)
          )
        )
      )
      .pipe(
        stream.subscribe(({ functionList }) => {
          d3.select("#function-runtimes").call(functionRuntimes.render, {
            functionList
          });
        })
      );
  } catch (err) {
    alert(err);
    window.close();
  }
});
